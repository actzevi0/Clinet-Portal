'use client';

import { useTransition } from 'react';
import { updateTaskStatus } from '@/lib/actions/tasks';

export function TaskCheckbox({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <input
      type="checkbox"
      disabled={pending}
      className="mt-1 h-4 w-4 rounded border-white/20 bg-white/5 cursor-pointer"
      onChange={(e) => start(() => updateTaskStatus(id, e.target.checked ? 'DONE' : 'OPEN'))}
    />
  );
}
