"use client";

import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { buildSchedulePdf } from "@/lib/generateSchedulePdf";
import { deserializeOrderFromPublicShare, type CompanyData } from "@/lib/orders-shared";
import { Button } from "@/components/ui/button";
import { Loader2, FileWarning, CheckCircle2, Download } from "lucide-react";

type Status = 'loading' | 'invalid' | 'ready' | 'downloaded' | 'error';

export default function CronogramaPublicoClient() {
  const [status, setStatus] = useState<Status>('loading');
  const [orderLabel, setOrderLabel] = useState('');
  const [download, setDownload] = useState<null | (() => Promise<void>)>(null);

  useEffect(() => {
    const load = async () => {
      // Lê o token direto da URL real do navegador — usePathname do Next
      // não é confiável aqui porque essa página é servida sempre como o
      // mesmo bundle estático (out/cronograma/index.html) para qualquer token.
      const token = window.location.pathname.split('/').filter(Boolean)[1];
      if (!token) { setStatus('invalid'); return; }

      try {
        const publicRef = doc(db, "public_schedules", token);
        const snap = await getDoc(publicRef);
        if (!snap.exists()) { setStatus('invalid'); return; }

        const data = snap.data();
        const order = deserializeOrderFromPublicShare(data, token);
        const companyData: CompanyData = data.companySnapshot || {};

        setOrderLabel(order.quotationNumber);
        setDownload(() => async () => {
          const pdf = await buildSchedulePdf(order, companyData);
          pdf.save(`Cronograma_Pedido_${order.quotationNumber}.pdf`);
        });
        setStatus('ready');
      } catch (error) {
        console.error("Erro ao carregar cronograma público:", error);
        setStatus('error');
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (status === 'ready' && download) {
      download().then(() => setStatus('downloaded')).catch(() => setStatus('error'));
    }
  }, [status, download]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center space-y-4">
        {status === 'loading' && (
          <>
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-blue-600" />
            <p className="text-slate-600">Carregando cronograma...</p>
          </>
        )}
        {status === 'invalid' && (
          <>
            <FileWarning className="mx-auto h-10 w-10 text-red-500" />
            <h1 className="text-lg font-semibold">Link inválido</h1>
            <p className="text-sm text-slate-500">Solicite um novo link ao fornecedor.</p>
          </>
        )}
        {status === 'error' && (
          <>
            <FileWarning className="mx-auto h-10 w-10 text-red-500" />
            <h1 className="text-lg font-semibold">Erro ao carregar</h1>
            <p className="text-sm text-slate-500">Tente novamente em instantes.</p>
          </>
        )}
        {(status === 'ready' || status === 'downloaded') && (
          <>
            <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
            <h1 className="text-lg font-semibold">Cronograma do Pedido {orderLabel}</h1>
            <p className="text-sm text-slate-500">
              {status === 'downloaded' ? "Download iniciado. Se não abriu, use o botão abaixo." : "Preparando..."}
            </p>
            <Button onClick={() => download?.()} className="w-full">
              <Download className="mr-2 h-4 w-4" />
              Baixar Cronograma
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
