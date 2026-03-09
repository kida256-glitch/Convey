import express from 'express';
import fs from 'fs';
import path from 'path';

type Listing = {
    id: number;
    title: string;
    price: number;
    stock: number;
    status: 'Active' | 'Sold';
    images: string[];
    seller: string;
    description: string;
};

const app = express();
app.use(express.json());

const dataDir = path.join(process.cwd(), 'data');
const dbFile = path.join(dataDir, 'listings.json');

function ensureDb() {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(dbFile)) fs.writeFileSync(dbFile, '[]', 'utf-8');
}

function readListings(): Listing[] {
    ensureDb();
    try {
        return JSON.parse(fs.readFileSync(dbFile, 'utf-8')) as Listing[];
    } catch {
        return [];
    }
}

function writeListings(listings: Listing[]) {
    ensureDb();
    fs.writeFileSync(dbFile, JSON.stringify(listings, null, 2), 'utf-8');
}

app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
});

app.get('/api/listings', (_req, res) => {
    res.json(readListings());
});

app.post('/api/listings', (req, res) => {
    const body = req.body ?? {};
    const title = String(body.title ?? '').trim();
    const description = String(body.description ?? '').trim();
    const seller = String(body.seller ?? '').trim();
    const price = Number(body.price ?? 0);
    const stock = Number(body.stock ?? 0);
    const images = Array.isArray(body.images) ? body.images.map((v: unknown) => String(v)) : [];

    if (!title || !description || !seller || !Number.isFinite(price) || price <= 0 || !Number.isInteger(stock) || stock < 1) {
        return res.status(400).json({ error: 'Invalid listing payload' });
    }

    const listings = readListings();
    const nextId = listings.length ? Math.max(...listings.map((l) => l.id)) + 1 : 1;

    const listing: Listing = {
        id: nextId,
        title,
        description,
        seller,
        price,
        stock,
        images,
        status: 'Active',
    };

    listings.push(listing);
    writeListings(listings);
    return res.status(201).json(listing);
});

app.post('/api/listings/:id/decrement', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
        return res.status(400).json({ error: 'Invalid listing id' });
    }

    const listings = readListings();
    const idx = listings.findIndex((l) => l.id === id);
    if (idx < 0) {
        return res.status(404).json({ error: 'Listing not found' });
    }

    const listing = listings[idx];
    const nextStock = Math.max(0, listing.stock - 1);
    listings[idx] = {
        ...listing,
        stock: nextStock,
        status: nextStock === 0 ? 'Sold' : listing.status,
    };

    writeListings(listings);
    return res.json(listings[idx]);
});

const port = Number(process.env.API_PORT ?? 8787);
app.listen(port, () => {
    console.log(`Convey API listening on http://localhost:${port}`);
});
