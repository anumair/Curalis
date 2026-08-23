import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { listFailedNotifications, retryNotification } from '../../api/admin.js';
import { Button } from '../../components/ui/Button.jsx';
import { Tag } from '../../components/ui/Tag.jsx';
import { useToast } from '../../components/ui/Toast.jsx';

const TYPE_LABEL = {
  BOOKING_CONFIRMATION: 'Booking confirmation',
  CANCELLATION: 'Cancellation',
  RESCHEDULE: 'Reschedule',
  APPT_REMINDER: 'Appointment reminder',
  MEDICATION_REMINDER: 'Medication reminder',
  LEAVE_CANCELLATION: 'Leave cancellation',
};

export function NotificationLogPage() {
  const [page, setPage] = useState(1);
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['admin-notifications-failed', page], queryFn: () => listFailedNotifications(page) });

  const retryMutation = useMutation({
    mutationFn: retryNotification,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-notifications-failed'] });
      toast('Queued for retry.');
    },
    onError: () => toast("Couldn't retry that notification."),
  });

  const notifications = data?.notifications ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="pg" style={{ maxWidth: 1180, margin: '0 auto', padding: 'clamp(28px,4vw,52px) clamp(16px,4vw,28px) 96px' }}>
      <h1 style={{ fontSize: 'clamp(34px,4.4vw,52px)', marginBottom: 6 }}>Failed notifications</h1>
      <p style={{ opacity: 0.7, marginBottom: 'var(--space-6)' }}>Emails that exhausted their automatic retries and need attention.</p>

      <div className="card" style={{ padding: 'var(--space-4) var(--space-6)', gap: 0, maxWidth: 220, marginBottom: 'var(--space-8)' }}>
        <p style={{ fontFamily: 'var(--font-heading)', fontSize: 32, lineHeight: 1, margin: 0, color: total > 0 ? 'var(--color-accent-700)' : 'var(--color-text)' }}>{total}</p>
        <p style={{ fontSize: 12, opacity: 0.7, margin: '6px 0 0' }}>Failed, need attention</p>
      </div>

      {isLoading && <p style={{ opacity: 0.6 }}>Loading…</p>}

      <div style={{ display: 'grid', gap: 'var(--space-2)' }}>
        {notifications.map((n) => (
          <div key={n.id} className="card" style={{ padding: 'var(--space-4) var(--space-6)', flexDirection: 'row', gap: 'var(--space-4)', flexWrap: 'wrap', alignItems: 'flex-start', borderLeft: '4px solid var(--color-accent-600)' }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <p style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{TYPE_LABEL[n.type] ?? n.type}</p>
              <p style={{ fontSize: 13, margin: '2px 0 0', opacity: 0.8 }}>{n.subject}</p>
              <p style={{ fontSize: 12, margin: '4px 0 0', opacity: 0.6 }}>{n.recipientEmail}</p>
              {n.lastError && <p style={{ fontSize: 13, margin: '6px 0 0', color: 'var(--color-accent-800)' }}>{n.lastError}</p>}
            </div>
            <div style={{ textAlign: 'right', minWidth: 170 }}>
              <Tag variant="accent">Failed</Tag>
              <p style={{ fontSize: 12, opacity: 0.6, margin: '6px 0 0' }}>{new Date(n.updatedAt).toLocaleString()}</p>
              <p style={{ fontSize: 12, opacity: 0.6, margin: '2px 0 0' }}>
                {n.attempts} of {n.maxAttempts} attempts
              </p>
              <Button style={{ marginTop: 8 }} onClick={() => retryMutation.mutate(n.id)} disabled={retryMutation.isPending}>
                Retry now
              </Button>
            </div>
          </div>
        ))}
      </div>

      {!isLoading && notifications.length === 0 && (
        <div style={{ padding: 'var(--space-8) 0', maxWidth: '44ch' }}>
          <h3>Nothing failed.</h3>
          <p style={{ opacity: 0.7 }}>Every notification has either sent successfully or is still retrying on its own.</p>
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-6)' }}>
          <Button variant="secondary" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
            Previous
          </Button>
          <Button variant="secondary" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
            Next
          </Button>
        </div>
      )}

      <p
        style={{
          fontSize: 13,
          background: 'var(--color-accent-100)',
          color: 'var(--color-accent-800)',
          padding: 'var(--space-4) var(--space-6)',
          borderRadius: 'calc(var(--radius-lg) * 1.15)',
          marginTop: 'var(--space-6)',
          maxWidth: '70ch',
          textWrap: 'pretty',
        }}
      >
        Curalis retries failed emails automatically, waiting longer between each attempt, up to 5 times. Anything listed here has exhausted its retries and needs a manual retry or a direct call to the patient.
      </p>
    </div>
  );
}
