import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { EventManifest } from '../../types';
import { getAvailableEvents, deleteEvent } from '../../lib/eventService';
import { Button } from '../shared/Button';
import { AppShell } from '../shared/AppShell';

type EventInfo = EventManifest['events'][0];

export function EventList() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<EventInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    setLoading(true);
    const eventsList = await getAvailableEvents();
    setEvents(eventsList);
    setLoading(false);
  };

  const handleDelete = async (eventId: string, eventName: string) => {
    if (!confirm(`Delete event "${eventName}"? This cannot be undone.`)) {
      return;
    }

    setDeleting(eventId);
    const result = await deleteEvent(eventId);
    if (result.success) {
      await loadEvents();
    } else {
      alert(result.error || 'Failed to delete event');
    }
    setDeleting(null);
  };

  return (
    <AppShell title="Events" maxWidth="xl">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-[var(--text-primary)]">Events</h1>
          <p className="text-[var(--text-secondary)] mt-1">
            Bundled playlists and card packs for one-click loading
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="ghost" onClick={() => navigate('/admin')}>
            Back to Admin
          </Button>
          <Link to="/admin/events/new">
            <Button variant="primary" size="lg">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Event
            </Button>
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="text-[var(--text-secondary)] text-center py-12">Loading events...</div>
      ) : events.length === 0 ? (
        <div className="card text-center py-16 max-w-lg mx-auto">
          <div className="w-16 h-16 rounded-full bg-[var(--bg-hover)] flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">No events yet</h2>
          <p className="text-[var(--text-secondary)] mb-6">
            Create an event to bundle a playlist and card pack together
          </p>
          <Link to="/admin/events/new">
            <Button variant="primary">Create Your First Event</Button>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {events.map(event => (
            <div key={event.id} className="card flex flex-col">
              <div className="flex-1 mb-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-lg font-semibold text-[var(--text-primary)]">{event.name}</h3>
                  <span className="badge badge-info">Event</span>
                </div>
                <div className="space-y-1 text-sm text-[var(--text-secondary)]">
                  <p>Playlist: {event.playlistId}</p>
                  <p>Card Pack: {event.cardPackId}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-4 border-t border-[var(--border-color)]">
                <Link to={`/admin/events/${event.id}`} className="flex-1 min-w-[80px]">
                  <Button variant="secondary" size="sm" fullWidth>Edit</Button>
                </Link>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => handleDelete(event.id, event.name)}
                  disabled={deleting === event.id}
                  className="flex-1 min-w-[80px]"
                >
                  {deleting === event.id ? 'Deleting...' : 'Delete'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info box */}
      <div className="mt-8 p-4 bg-[var(--bg-hover)] rounded-lg">
        <h3 className="font-semibold text-[var(--text-primary)] mb-2">How Events Work</h3>
        <ul className="text-sm text-[var(--text-secondary)] space-y-1 list-disc list-inside">
          <li>Events bundle a playlist and card pack into a single package</li>
          <li>Hosts can load an event with one click from the home screen</li>
          <li>Event includes default patterns and player count settings</li>
          <li>Audio still needs to be downloaded separately if not cached</li>
        </ul>
      </div>
    </AppShell>
  );
}
