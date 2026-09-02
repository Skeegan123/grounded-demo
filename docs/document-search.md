# Prepared Document Evidence search

`search_project_documents` searches the committed schema version 2 artifacts.
It does not call an OCR service, embedding model, vector database, or runtime
language model. Search locates likely prepared content; the External Agent must
inspect a matching block before using Document Evidence.

## Normalization and ranking

The index and query use the same deterministic normalization. Search lowercases
Unicode NFKC text, removes HTML markup, decodes entities, normalizes quotation
marks and dash variants, and collapses whitespace. Dimension spellings such as
`24" x 80"`, `24 in by 80 in`, and `24×80` share the token `24x80`. Sheet and
product punctuation remains intact in identifiers such as `A4.3`,
`BRD-HC2480-BIR`, `F-72`, and `1-3/8`.

Ordinary alphabetic words receive conservative plural folding. For example,
`doors` matches `door`, `assemblies` matches `assembly`, and `boxes` matches
`box`. Identifiers are never stemmed. Exact phrases and construction identifiers
rank before full exact token coverage, partial exact coverage, mixed exact and
fuzzy coverage, and fuzzy-only coverage. Source order provides the final stable
tie-break.

Fuzzy matching applies only to ordinary alphabetic terms with at least five
characters. Terms with five through seven characters allow one edit. Longer
terms allow at most two edits. Every fuzzy match also requires at least 0.8
similarity. Adjacent transpositions count as one edit. Dimensions, sheet
numbers, model numbers, and single-letter marks require exact canonical matches.

## Minimum relevance policy

A record qualifies when it has an exact primary phrase or exact construction
identifier. Otherwise, it needs at least one exact or plural-normalized content
term and at least 50% weighted query coverage. Fuzzy-only retrieval needs two
matched terms and at least 70% fuzzy coverage. One fuzzy term qualifies only
when it has at least eight characters, at least 0.875 similarity, and appears in
no more than two prepared search records.

Metadata can improve a result that already has a content signal, but metadata
alone cannot qualify it. The threshold runs before sorting and limiting, so an
unrelated query returns an empty match list even when the caller requests 20
results. Search returns rank and matched query terms, never the private score.

## Search hints

Generated figure descriptions, synopses, and tags remain `search_hint` in both
search and inspection. They can locate a likely plan, detail, schedule, or
figure, but they cannot support a claim. The Senior Project Manager retains
visual interpretation, selection, measurement, and counting.
