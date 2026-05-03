'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui';
import { runAutoMatch } from '@/lib/actions/reconcile';
import { Sparkles } from 'lucide-react';

export function RunMatchButton({ month }: { month: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-2">
      <Button
        disabled={pending}
        onClick={() => start(async () => {
          const r = await runAutoMatch(month);
          setMsg(`נמצאו ${r.proposals} הצעות, נוצרו ${r.created} התאמות`);
          setTimeout(() => setMsg(null), 5000);
        })}
      >
        <Sparkles className="h-4 w-4" />
        {pending ? 'מתאים...' : 'הרץ התאמה אוטומטית'}
      </Button>
      {msg && <span className="text-xs text-emerald-300">{msg}</span>}
    </div>
  );
}
