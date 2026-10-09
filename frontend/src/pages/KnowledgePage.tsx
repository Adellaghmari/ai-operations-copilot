import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { formatDate } from "../lib/utils";
import { Badge, Button, Card, Field, Input } from "../components/ui";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export function KnowledgePage() {
  const queryClient = useQueryClient();
  const docs = useQuery({ queryKey: ["knowledge"], queryFn: api.knowledge });
  const [query, setQuery] = useState("password reset");
  const [selected, setSelected] = useState<string | null>(null);
  const search = useQuery({
    queryKey: ["knowledge-search", query],
    queryFn: () => api.knowledgeSearch(query),
    enabled: query.length > 1,
  });
  const chunks = useQuery({
    queryKey: ["chunks", selected],
    queryFn: () => api.chunks(selected!),
    enabled: Boolean(selected),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteDocument(id),
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ["knowledge"] }),
  });
  const [uploadError, setUploadError] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Knowledge base</h1>
      <Card>
        <Field label="Upload Markdown, TXT, or PDF">
          <input
            type="file"
            accept=".md,.txt,.pdf"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const data = new FormData();
              data.append("file", file);
              data.append("title", file.name);
              setUploadError(null);
              const response = await fetch(`${API_BASE}/api/knowledge/upload`, {
                method: "POST",
                body: data,
                credentials: "include",
              });
              if (!response.ok) {
                setUploadError(await response.text());
                return;
              }
              await queryClient.invalidateQueries({ queryKey: ["knowledge"] });
            }}
          />
        </Field>
        {uploadError ? <p className="mt-2 text-sm text-red-700">{uploadError}</p> : null}
        <Field label="Manual search">
          <Input value={query} onChange={(event) => setQuery(event.target.value)} />
        </Field>
        <ul className="mt-3 space-y-2 text-sm">
          {search.data?.map((item) => (
            <li key={item.chunk_id} className="rounded-md bg-stone-50 p-3">
              <p className="font-medium">{item.document_name} · {item.section}</p>
              <p className="mt-1 text-stone-600">{item.body.slice(0, 240)}</p>
            </li>
          ))}
        </ul>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        {docs.data?.map((doc) => (
          <Card key={doc.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{doc.title}</h2>
                <p className="text-xs text-stone-500">{doc.filename}</p>
              </div>
              <Badge tone={doc.visibility === "evaluation_only" ? "warn" : "neutral"}>
                {doc.visibility}
              </Badge>
            </div>
            <p className="mt-3 text-sm text-stone-600">
              {doc.ingestion_status} · {doc.chunk_count} chunks · last indexed {formatDate(doc.last_indexed_at)}
            </p>
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" onClick={() => setSelected(doc.id)}>Inspect chunks</Button>
              <Button variant="ghost" onClick={() => remove.mutate(doc.id)}>Delete</Button>
            </div>
          </Card>
        ))}
      </div>
      {chunks.data ? (
        <Card>
          <h2 className="font-semibold">Chunks</h2>
          <ul className="mt-3 space-y-3 text-sm">
            {chunks.data.map((chunk) => (
              <li key={chunk.id} className="rounded-md bg-stone-50 p-3">
                <p className="font-medium">{chunk.section}</p>
                <p className="mt-1 whitespace-pre-wrap">{chunk.body}</p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
