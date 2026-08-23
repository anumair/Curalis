import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { listDoctors, listSpecialisations } from '../../api/doctors.js';
import { initialsOf } from '../../lib/initials.js';
import { Button } from '../../components/ui/Button.jsx';
import { Field, Input, Select } from '../../components/ui/Field.jsx';

const SORTS = {
  'Name (A–Z)': (a, b) => a.fullName.localeCompare(b.fullName),
  'Consultation fee': (a, b) => Number(a.consultationFee) - Number(b.consultationFee),
};

export function FindDoctorPage() {
  const [query, setQuery] = useState('');
  const [specialisation, setSpecialisation] = useState('');
  const [sort, setSort] = useState('Name (A–Z)');

  const specialisationsQuery = useQuery({ queryKey: ['specialisations'], queryFn: listSpecialisations });
  const doctorsQuery = useQuery({
    queryKey: ['doctors', { q: query, specialisation }],
    queryFn: () => listDoctors({ q: query || undefined, specialisation: specialisation || undefined }),
  });

  const doctors = useMemo(() => {
    const list = doctorsQuery.data?.doctors ?? [];
    return [...list].sort(SORTS[sort]);
  }, [doctorsQuery.data, sort]);

  const hasFilters = query || specialisation;

  return (
    <div className="pg" style={{ maxWidth: 1180, margin: '0 auto', padding: 'clamp(28px,4vw,52px) clamp(16px,4vw,28px) 96px' }}>
      <h1 style={{ fontSize: 'clamp(34px,4.4vw,52px)', marginBottom: 6 }}>Find a doctor</h1>
      <p style={{ opacity: 0.7, marginBottom: 'var(--space-6)' }}>Search by specialisation or by name.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 'var(--space-3)', alignItems: 'end', marginBottom: 'var(--space-4)' }}>
        <Field label="Search" style={{ gridColumn: 'span 2', minWidth: 200 }}>
          <Input placeholder="Doctor name or specialisation" value={query} onChange={(e) => setQuery(e.target.value)} />
        </Field>
        <Field label="Specialisation">
          <Select value={specialisation} onChange={(e) => setSpecialisation(e.target.value)}>
            <option value="">All specialisations</option>
            {specialisationsQuery.data?.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Sort by">
          <Select value={sort} onChange={(e) => setSort(e.target.value)}>
            {Object.keys(SORTS).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <p style={{ fontSize: 13, opacity: 0.6, marginBottom: 'var(--space-4)' }}>
        {doctorsQuery.isLoading ? 'Searching…' : `${doctors.length} doctor${doctors.length === 1 ? '' : 's'} found`}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 'var(--space-4)' }}>
        {doctors.map((d) => (
          <div key={d.id} className="card elev-sm" style={{ padding: 'clamp(20px,2.5vw,28px)', gap: 'var(--space-2)' }}>
            <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
              <span
                style={{
                  width: 46,
                  height: 46,
                  flex: 'none',
                  borderRadius: 999,
                  background: 'var(--color-accent-200)',
                  color: 'var(--color-accent-800)',
                  display: 'grid',
                  placeItems: 'center',
                  fontFamily: 'var(--font-heading)',
                  fontSize: 16,
                }}
              >
                {initialsOf(d.fullName)}
              </span>
              <div style={{ flex: 1 }}>
                <p style={{ fontFamily: 'var(--font-heading)', fontSize: 20, lineHeight: 1.15, margin: 0 }}>{d.fullName}</p>
                <p style={{ fontSize: 13, color: 'var(--color-accent-700)', margin: '3px 0 0' }}>{d.specialisation}</p>
                {d.qualification && <p style={{ fontSize: 12, opacity: 0.6, margin: '2px 0 0' }}>{d.qualification}</p>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-4)', fontSize: 13, opacity: 0.8, flexWrap: 'wrap', marginTop: 'var(--space-2)' }}>
              <span>₹{d.consultationFee}</span>
              <span>{d.slotDurationMin} min</span>
            </div>
            <Button as={Link} to={`/book/${d.id}`} style={{ alignSelf: 'flex-start', marginTop: 'var(--space-3)' }}>
              View profile and book
            </Button>
          </div>
        ))}
      </div>

      {!doctorsQuery.isLoading && doctors.length === 0 && (
        <div style={{ padding: 'var(--space-8) 0', maxWidth: '44ch' }}>
          <h3>No doctors match your search.</h3>
          <p style={{ opacity: 0.7 }}>Try a different specialisation, or clear your filters.</p>
          {hasFilters && (
            <Button
              variant="secondary"
              onClick={() => {
                setQuery('');
                setSpecialisation('');
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
