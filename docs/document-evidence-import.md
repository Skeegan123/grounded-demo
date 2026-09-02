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

Bind that exact export to its immutable document version before importing it:

```bash
shasum -a 256 .reducto/virginia-farmhouse-drawings.json
```

Copy the lowercase fingerprint into the document's
`preparedEvidence.parseExportSha256` field in
`src/demoProject/demoProjectManifest.json`. Keep `requiredModel` at `r-1`.
The importer checks the raw file bytes before reading Parse content, so a
swapped export or a reformatted copy fails closed even when its page count
matches. Change this binding only as part of a new reviewed document version or
an intentional re-export of that version.

Run the importer with the stable document identity from
`src/demoProject/demoProjectManifest.json`:

```bash
pnpm import:document-evidence \
  --document virginia-farmhouse-drawings \
  --export .reducto/virginia-farmhouse-drawings.json

pnpm import:document-evidence \
  --document type-c-door-submittal \
  --export .reducto/type-c-door-submittal.json
```

The command resolves the current immutable document version from the manifest.
It verifies the raw-export fingerprint, the `R-1` model reported at
`usage.usage_breakdown.parse_model`, the local PDF checksum and byte size, the
Parse response type, the page count, every numbered page reference, required
block content, and normalized regions before it writes anything. The output is
`src/documents/generated/<document-version-id>.json`.

Each command regenerates only the selected document version's artifact. At
application startup, Grounded validates the complete manifest and artifact set
before it registers any document tool. Runtime resolves artifact filenames from
the manifest versions. Adding or replacing a version does not require an import
statement in application code.

Each artifact contains only one document version. It keeps ordered blocks,
manifest page identities, table HTML and derived row records, optional low-level
OCR positions, and Reducto provenance. It drops job IDs, usage and billing data,
Studio links, result URLs, PDF URLs, and image URLs.

The artifact records the bound export fingerprint and reported model under
`provenance.verified`. Reducto's current Studio exports leave
`document_properties` and `parse_mode` null, so they do not independently prove
the other Studio options. The artifact labels those requested options as
`provenance.maintainerDeclaredParseSettings` instead of presenting them as
export-verified facts.

Use `--output` to write to another path. `--manifest` and `--source-directory`
support isolated fixture or replacement-project checks without changing the
default Demo Project paths.
