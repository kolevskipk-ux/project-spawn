CREATE TABLE customer_legal_document_views (
 customer_id TEXT NOT NULL REFERENCES customer_members(id) ON DELETE CASCADE,
 terms_version TEXT NOT NULL,
 document TEXT NOT NULL CHECK(document IN ('terms','privacy')),
 opened_at TEXT NOT NULL,
 PRIMARY KEY(customer_id,terms_version,document)
);
