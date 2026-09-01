# Import prepared Document Evidence

Parse one immutable Demo Project document in Reducto Studio with this configuration:

```json
{
  "settings": {
    "model": "r-1",
    "return_images": [],
    "return_ocr_data": true
  },
  "retrieval": {
    "chunking": { "chunk_mode": "disabled" },
    "embedding_optimized": false
  },
  "formatting": {
    "table_output_format": "html"
  },
  "enhance": {
    "agentic": []
  }
}
```

Download the self-contained Parse JSON into `.reducto/`. Do not commit the raw
export. An export whose `result.type` is `url` still points at transient data;
download the full result from Studio before importing it.

Run the importer with the stable document identity from
`src/demoProject/demoProjectManifest.json`:

```bash
pnpm import:document-evidence \
  --document virginia-farmhouse-drawings \
  --export .reducto/virginia-farmhouse-drawings.json
```

The command resolves the current immutable document version from the manifest.
It verifies the local PDF checksum and byte size, the Parse response type, the
page count, every numbered page reference, required block content, and normalized
regions before it writes anything. The output is
`src/documents/generated/<document-version-id>.json`.

Each artifact contains only one document version. It keeps ordered blocks,
manifest page identities, table HTML and derived row records, optional low-level
OCR positions, and Reducto provenance. It drops job IDs, usage and billing data,
Studio links, result URLs, PDF URLs, and image URLs.

Use `--output` to write to another path. `--manifest` and `--source-directory`
support isolated fixture or replacement-project checks without changing the
default Demo Project paths.
