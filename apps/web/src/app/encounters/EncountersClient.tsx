"use client";

import { useState, useEffect, useCallback } from "react";
import { ErrorMessage, Toast } from "@/components/ui";
import { CreateEncounterForm, type CreateEncounterData } from "@/components/forms/CreateEncounterForm";

const API = "http://localhost:3001/api/v1";

interface Encounter { id: string; patientId: string; date: string; notes: string; }

interface Labels {
  title: string; loading: string; empty: string;
  id: string; patient: string; date: string; notes: string;
}

export default function EncountersClient({ labels }: { labels: Labels }) {
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const fetchEncounters = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`${API}/encounters`)
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return res.json();
      })
      .then((data) => { setEncounters(data.data || data || []); setLoading(false); })
      .catch((err) => { setError(err.message || "Failed to load encounters."); setLoading(false); });
  }, []);

  useEffect(() => { fetchEncounters(); }, [fetchEncounters]);

  const handleCreate = async (data: CreateEncounterData) => {
    const res = await fetch(`${API}/encounters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message || `Error ${res.status}`);
    }
    setShowForm(false);
    setToast({ message: "Encounter created successfully.", type: "success" });
    fetchEncounters();
  };

  if (loading) return <p role="status" aria-live="polite" className="px-4 py-8 text-gray-500">{labels.loading}</p>;
  if (error) return <ErrorMessage message={error} onRetry={fetchEncounters} />;

  return (
    <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{labels.title}</h1>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + New Encounter
        </button>
      </div>

      {showForm && (
        <div className="mb-8 rounded-lg border border-gray-200 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">New Encounter</h2>
          <CreateEncounterForm onSubmit={handleCreate} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {encounters.length === 0 ? (
        <p role="status" className="text-gray-500">{labels.empty}</p>
      ) : (
        <ul aria-label={labels.title} className="flex flex-col gap-4 list-none p-0 m-0">
          {encounters.map((e) => (
            <li key={e.id} className="rounded border border-gray-200 p-4 shadow-sm">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                <div><p className="text-xs text-gray-500 uppercase tracking-wide">{labels.id}</p><p className="font-medium text-gray-900 break-all">{e.id}</p></div>
                <div><p className="text-xs text-gray-500 uppercase tracking-wide">{labels.patient}</p><p className="font-medium text-gray-900 break-all">{e.patientId}</p></div>
                <div><p className="text-xs text-gray-500 uppercase tracking-wide">{labels.date}</p><p className="text-gray-700">{e.date}</p></div>
                <div><p className="text-xs text-gray-500 uppercase tracking-wide">{labels.notes}</p><p className="text-gray-700">{e.notes}</p></div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
