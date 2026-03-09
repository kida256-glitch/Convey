/**
 * useConvey — wagmi hooks for ConveyMarketplace on the configured Avalanche chain.
 * All write hooks use `as any` on the abi to avoid wagmi v2 deep type instantiation errors.
 */
import { useCallback, useState, useEffect, useRef } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, useReadContract, useSwitchChain } from 'wagmi';
import { parseEther, formatEther } from 'viem';
import { readContract } from '@wagmi/core';
import { CONVEY_ADDRESS, CONVEY_ABI } from './contract';
import { ACTIVE_CHAIN_ID, ACTIVE_CHAIN_NAME, config } from '../wagmi';
import { ensureActiveChainInWallet, getWalletChainHex, switchToActiveChainInWallet, ACTIVE_CHAIN_HEX } from './walletNetwork';

// Cast once — avoids TS2589 "type instantiation excessively deep" in wagmi's overloads
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const abi = CONVEY_ABI as any;

function assertDeployed() {
  if (!CONVEY_ADDRESS) {
    throw new Error(
      'Contract not deployed yet.\nRun: cd blockchain && npm run deploy:<network>\n' +
      'Then set VITE_CONTRACT_ADDRESS in your .env file.',
    );
  }
}

function useConveyWrite() {
  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();
  const { isSuccess, isLoading: isConfirming, error: receiptError } = useWaitForTransactionReceipt({
    hash,
    chainId: ACTIVE_CHAIN_ID,
    query: { enabled: !!hash },   // don't fire until we actually have a tx hash
  });

  const ensureActiveChain = useCallback(async () => {
    const currentHex = await getWalletChainHex();
    if (currentHex?.toLowerCase() === ACTIVE_CHAIN_HEX.toLowerCase()) return;

    try {
      await ensureActiveChainInWallet();
    } catch {
      // Ignore wallet_addEthereumChain errors and still attempt switch.
    }

    const switchedInWallet = await switchToActiveChainInWallet();
    if (switchedInWallet) return;

    if (!switchChainAsync) {
      throw new Error(`Please switch your wallet to ${ACTIVE_CHAIN_NAME} (${ACTIVE_CHAIN_ID}) and try again.`);
    }

    await switchChainAsync({ chainId: ACTIVE_CHAIN_ID });

    const verifiedHex = await getWalletChainHex();
    if (verifiedHex?.toLowerCase() !== ACTIVE_CHAIN_HEX.toLowerCase()) {
      throw new Error(`Wallet did not switch to ${ACTIVE_CHAIN_NAME} (${ACTIVE_CHAIN_ID}). Please switch networks in your wallet and retry.`);
    }
  }, [switchChainAsync]);

  // Combine wallet-rejection error and on-chain revert error into one field.
  const error = writeError ?? receiptError ?? null;
  return {
    writeContract,
    ensureActiveChain,
    hash,
    isAwaitingWallet: isPending && !hash,
    isTransactionPending: !!hash && isConfirming,
    isPending: isPending || isConfirming,
    isSuccess,
    error,
  };
}

export function parseConveyTxError(error: unknown): string {
  const raw = `${(error as any)?.shortMessage ?? (error as Error)?.message ?? error ?? ''}`.toLowerCase();

  if (raw.includes('user rejected') || raw.includes('user denied') || raw.includes('rejected the request')) {
    return 'User rejected the wallet transaction.';
  }
  if (raw.includes('insufficient funds')) {
    return 'Insufficient funds to cover value and gas.';
  }
  if (raw.includes('execution reverted') || raw.includes('revert')) {
    return 'Smart contract reverted the transaction. Check listing state and permissions.';
  }
  if (raw.includes('network error') || raw.includes('failed to fetch') || raw.includes('timeout') || raw.includes('rpc')) {
    return 'Network RPC failure while sending the transaction. Please retry.';
  }

  return (error as Error)?.message || 'Transaction failed.';
}

/** Wraps a writeContract payload to always target the configured chain */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function activeChainWrite(writeContract: any, ensureActiveChain: () => Promise<void>, payload: Record<string, any>) {
  await ensureActiveChain();
  writeContract({ ...payload, chainId: ACTIVE_CHAIN_ID });
}

// ─── Seller ────────────────────────────────────────────────────────────────────

export function useCreateListing() {
  const {
    writeContract,
    ensureActiveChain,
    hash,
    isAwaitingWallet,
    isTransactionPending,
    isPending,
    isSuccess,
    error,
  } = useConveyWrite();
  const create = useCallback(
    (o: { title: string; description: string; imageURI: string; priceAvax: number; stock: number }) => {
      assertDeployed();
      void activeChainWrite(writeContract, ensureActiveChain, {
        address: CONVEY_ADDRESS, abi, functionName: 'listProduct',
        args: [o.title, o.description, o.imageURI, parseEther(o.priceAvax.toString()), o.stock],
      });
    },
    [writeContract, ensureActiveChain],
  );
  return { create, hash, isAwaitingWallet, isTransactionPending, isPending, isSuccess, error };
}

export function useCancelListing() {
  const { writeContract, ensureActiveChain, isPending, isSuccess, error } = useConveyWrite();
  const cancel = useCallback(
    (listingId: number) => {
      assertDeployed();
      void activeChainWrite(writeContract, ensureActiveChain, { address: CONVEY_ADDRESS, abi, functionName: 'cancelListing', args: [BigInt(listingId)] });
    },
    [writeContract, ensureActiveChain],
  );
  return { cancel, isPending, isSuccess, error };
}

// ─── Buyer ─────────────────────────────────────────────────────────────────────

export function useBuyDirect() {
  const { writeContract, ensureActiveChain, hash, isPending, isSuccess, error } = useConveyWrite();
  const buy = useCallback(
    (listingId: number, priceWei: bigint) => {
      assertDeployed();
      void activeChainWrite(writeContract, ensureActiveChain, {
        address: CONVEY_ADDRESS, abi, functionName: 'buyDirect',
        args: [BigInt(listingId)], value: priceWei,
      });
    },
    [writeContract, ensureActiveChain],
  );
  return { buy, hash, isPending, isSuccess, error };
}

export function useMakeOffer() {
  const {
    writeContract,
    ensureActiveChain,
    hash,
    isAwaitingWallet,
    isTransactionPending,
    isPending,
    isSuccess,
    error,
  } = useConveyWrite();
  const offer = useCallback(
    (listingId: number, offerAvax: number | string) => {
      assertDeployed();
      void activeChainWrite(writeContract, ensureActiveChain, {
        address: CONVEY_ADDRESS, abi, functionName: 'depositToEscrow',
        args: [BigInt(listingId)], value: parseEther(offerAvax.toString()),
      });
    },
    [writeContract, ensureActiveChain],
  );
  return { offer, hash, isAwaitingWallet, isTransactionPending, isPending, isSuccess, error };
}

export function useCounterOffer() {
  const { writeContract, ensureActiveChain, isPending, isSuccess, error } = useConveyWrite();
  const counter = useCallback(
    (offerId: number, counterAvax: number) => {
      assertDeployed();
      void activeChainWrite(writeContract, ensureActiveChain, {
        address: CONVEY_ADDRESS, abi, functionName: 'counterOffer',
        args: [BigInt(offerId), parseEther(counterAvax.toString())],
      });
    },
    [writeContract, ensureActiveChain],
  );
  return { counter, isPending, isSuccess, error };
}

export function useAcceptOffer() {
  const {
    writeContract,
    ensureActiveChain,
    hash,
    isAwaitingWallet,
    isTransactionPending,
    isPending,
    isSuccess,
    error,
  } = useConveyWrite();
  const accept = useCallback(
    (listingId: number) => {
      assertDeployed();
      void activeChainWrite(writeContract, ensureActiveChain, { address: CONVEY_ADDRESS, abi, functionName: 'releaseFunds', args: [BigInt(listingId)] });
    },
    [writeContract, ensureActiveChain],
  );
  return { accept, hash, isAwaitingWallet, isTransactionPending, isPending, isSuccess, error };
}

export function useWithdraw() {
  const {
    writeContract,
    ensureActiveChain,
    hash,
    isAwaitingWallet,
    isTransactionPending,
    isPending,
    isSuccess,
    error,
  } = useConveyWrite();
  const withdraw = useCallback(() => {
    assertDeployed();
    void activeChainWrite(writeContract, ensureActiveChain, {
      address: CONVEY_ADDRESS,
      abi,
      functionName: 'withdraw',
      args: [],
    });
  }, [writeContract, ensureActiveChain]);
  return { withdraw, hash, isAwaitingWallet, isTransactionPending, isPending, isSuccess, error };
}

export function useAcceptCounter() {
  const { writeContract, ensureActiveChain, hash, isPending, isSuccess, error } = useConveyWrite();
  const acceptCounter = useCallback(
    (offerId: number, topUpAvax: number) => {
      assertDeployed();
      void activeChainWrite(writeContract, ensureActiveChain, {
        address: CONVEY_ADDRESS, abi, functionName: 'acceptCounter',
        args: [BigInt(offerId)],
        value: topUpAvax > 0 ? parseEther(topUpAvax.toString()) : 0n,
      });
    },
    [writeContract, ensureActiveChain],
  );
  return { acceptCounter, hash, isPending, isSuccess, error };
}

export function useCancelOffer() {
  const { writeContract, ensureActiveChain, hash, isPending, isSuccess, error } = useConveyWrite();
  const cancelOffer = useCallback(
    (offerId: number) => {
      assertDeployed();
      void activeChainWrite(writeContract, ensureActiveChain, { address: CONVEY_ADDRESS, abi, functionName: 'cancelOffer', args: [BigInt(offerId)] });
    },
    [writeContract, ensureActiveChain],
  );
  return { cancelOffer, hash, isPending, isSuccess, error };
}

export function useRejectOffer() {
  const { writeContract, ensureActiveChain, hash, isPending, isSuccess, error } = useConveyWrite();
  const rejectOffer = useCallback(
    (offerId: number) => {
      assertDeployed();
      void activeChainWrite(writeContract, ensureActiveChain, { address: CONVEY_ADDRESS, abi, functionName: 'rejectOffer', args: [BigInt(offerId)] });
    },
    [writeContract, ensureActiveChain],
  );
  return { rejectOffer, hash, isPending, isSuccess, error };
}

// ─── Reads ─────────────────────────────────────────────────────────────────────

const READ_QUERY_BASE = {
  staleTime: 30_000,
  refetchInterval: 60_000,
  retry: 2,
} as const;

export function useListingCount() {
  return useReadContract({
    address: CONVEY_ADDRESS || undefined,
    abi,
    chainId: ACTIVE_CHAIN_ID,
    functionName: 'listingCount',
    query: { enabled: !!CONVEY_ADDRESS, ...READ_QUERY_BASE },
  });
}

export function useOnChainListing(listingId: number) {
  return useReadContract({
    address: CONVEY_ADDRESS || undefined,
    abi,
    chainId: ACTIVE_CHAIN_ID,
    functionName: 'listings',
    args: [BigInt(listingId)],
    query: { enabled: !!CONVEY_ADDRESS && listingId > 0, ...READ_QUERY_BASE },
  });
}

export function useOfferDetails(offerId: number) {
  return useReadContract({
    address: CONVEY_ADDRESS || undefined,
    abi,
    chainId: ACTIVE_CHAIN_ID,
    functionName: 'getOfferDetails',
    args: [BigInt(offerId)],
    query: { enabled: !!CONVEY_ADDRESS && offerId > 0, ...READ_QUERY_BASE },
  });
}

export function useListingOffers(listingId: number) {
  return useReadContract({
    address: CONVEY_ADDRESS || undefined,
    abi,
    chainId: ACTIVE_CHAIN_ID,
    functionName: 'getListingOffers',
    args: [BigInt(listingId)],
    query: { enabled: !!CONVEY_ADDRESS && listingId > 0, ...READ_QUERY_BASE },
  });
}

export function useAllOnChainListings() {
  const [listings, setListings] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const fetchedCountRef = useRef(0);

  const refetch = useCallback(async () => {
    if (!CONVEY_ADDRESS) return;
    setIsLoading(true);
    try {
      // Step 1: get listing count via single eth_call
      const countRaw = await readContract(config, {
        address: CONVEY_ADDRESS,
        abi,
        chainId: ACTIVE_CHAIN_ID,
        functionName: 'listingCount',
      } as any);
      const count = Number(countRaw ?? 0n);
      if (count === 0) { setListings([]); return; }

      // Step 2: fetch each listing individually — avoids multicall entirely
      const results = await Promise.allSettled(
        Array.from({ length: count }, (_, i) =>
          readContract(config, {
            address: CONVEY_ADDRESS as `0x${string}`,
            abi,
            chainId: ACTIVE_CHAIN_ID,
            functionName: 'listings',
            args: [BigInt(i + 1)],
          } as any)
        )
      );

      const parsed = results
        .map((r) => {
          if (r.status !== 'fulfilled') return null;
          const [id, seller, title, description, imageURI, priceWei, stock, status] = r.value as [bigint, string, string, string, string, bigint, number, number];
          if (!id || !seller) return null;
          return {
            id: Number(id),
            onChainId: Number(id),
            title,
            description,
            images: imageURI ? [imageURI] : [],
            price: parseFloat(formatEther(priceWei)),
            priceWei,
            stock: Number(stock),
            status: (status === 0 ? 'Active' : status === 1 ? 'Sold' : 'Cancelled') as 'Active' | 'Sold',
            seller,
          };
        })
        .filter((l): l is NonNullable<typeof l> => l !== null);

      fetchedCountRef.current = count;
      setListings(parsed);
    } catch {
      // leave existing listings in place on error
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch + polling every 60 s
  useEffect(() => {
    if (!CONVEY_ADDRESS) return;
    refetch();
    const id = setInterval(refetch, 60_000);
    return () => clearInterval(id);
  }, [refetch]);

  return { listings, isLoading, refetch };
}
