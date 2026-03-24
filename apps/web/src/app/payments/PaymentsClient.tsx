"use client";

import { useState, useEffect } from "react";

interface Payment {
  id: string;
  patientId: string;
  amount: string;
  status: string;
  txHash?: string;
}

interface Labels {
  title: string;
  loading: string;
  empty: string;
  id: string;
  patient: string;
  amount: string;
  status: string;
  view: string;
}

export default function PaymentsClient({ labels }: { labels: Labels }) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("http://localhost:3001/api/v1/payments")
      .then((res) => res.json())
      .then((data) => { setPayments(data || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <p role="status" aria-live="polite" className="px-4 py-8 text-gray-500">
        {labels.loading}
      </p>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">{labels.title}</h1>
      {payments.length === 0 ? (
        <p role="status" className="text-gray-500">{labels.empty}</p>
      ) : (
        <ul aria-label={labels.title} className="flex flex-col gap-4 list-none p-0 m-0">
          {payments.map((p) => (
            <li key={p.id} className="rounded border border-gray-200 p-4 shadow-sm">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">{labels.id}</p>
                  <p className="font-medium text-gray-900 break-all">{p.id}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">{labels.patient}</p>
                  <p className="font-medium text-gray-900 break-all">{p.patientId}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">{labels.amount}</p>
                  <p className="text-gray-700">{p.amount} XLM</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">{labels.status}</p>
                  <p className="text-gray-700">{p.status}</p>
                </div>
              </div>
              {p.txHash && (
                <div className="mt-3 text-sm">
                  <a
                    href={`https://stellar.expert/explorer/testnet/tx/${p.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${labels.view} transaction ${p.txHash} on Stellar Explorer (opens in new tab)`}
                    className="text-blue-600 hover:underline focus:outline-none focus:underline"
                  >
                    {labels.view} →
                  </a>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
