/**
 * LEGACY / "ON-PREM" VERSION
 * -----------------------------------------------------------------------
 * This represents the pre-migration app: a single Node process, files
 * saved to local disk, a "slow" metadata lookup with no caching, and
 * batch uploads processed strictly one-by-one (serial).
 *
 * This is the baseline we compare the migrated version against.
 * -----------------------------------------------------------------------
 */
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const app = express();
app.use(cors());
app.use(express.json());

const UPLOAD_DIR = path.join(__dirname, "storage");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

const upload = multer({ dest: UPLOAD_DIR });

// In-memory "database" -- a flat JSON file. No indexing, no real DB.
const DB_FILE = path.join(__dirname, "db.json");
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, "[]");

function readDb() {
  return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
}
function writeDb(records) {
  fs.writeFileSync(DB_FILE, JSON.stringify(records, null, 2));
}

// Simulates a "slow" lookup (e.g. an unindexed scan) with NO caching.
// Every call pays the full cost, on purpose -- this is what we fix later.
function slowLookup(id) {
  const start = Date.now();
  while (Date.now() - start < 150) {
    /* busy-wait to simulate an expensive, uncached DB/query cost */
  }
  const records = readDb();
  return records.find((r) => r.id === id);
}

app.post("/upload", upload.single("file"), (req, res) => {
  const record = {
    id: uuidv4(),
    originalName: req.file.originalname,
    storedPath: req.file.path,
    uploadedAt: new Date().toISOString(),
  };
  const records = readDb();
  records.push(record);
  writeDb(records);
  res.json({ message: "Uploaded to local disk (legacy)", record });
});

// SERIAL batch processing: each item is handled one after another.
// This is the "before" case for the serial-vs-parallel benchmark.
app.post("/batch-process", async (req, res) => {
  const { count = 5 } = req.body;
  const start = Date.now();
  const results = [];

  for (let i = 0; i < count; i++) {
    // simulate per-item work (e.g. resize, virus-scan, transcode)
    await new Promise((r) => setTimeout(r, 200));
    results.push(`item-${i}-processed`);
  }

  res.json({
    mode: "serial",
    count,
    durationMs: Date.now() - start,
    results,
  });
});

app.get("/lookup/:id", (req, res) => {
  const start = Date.now();
  const record = slowLookup(req.params.id);
  res.json({
    cached: false,
    durationMs: Date.now() - start,
    record: record || null,
  });
});

app.get("/records", (req, res) => {
  res.json({ records: readDb() });
});

app.get("/health", (req, res) => res.json({ status: "ok", mode: "legacy" }));

const PORT = process.env.LEGACY_PORT || 4000;
app.listen(PORT, () => {
  console.log(`[legacy] monolith running on http://localhost:${PORT}`);
  console.log(`[legacy] storing files on local disk at ${UPLOAD_DIR}`);
});
