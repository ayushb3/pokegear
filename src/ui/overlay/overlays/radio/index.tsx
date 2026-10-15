import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { dim, goTo } from '../../../../world/api';
import { useOverlay, useOverlayInput, type OverlayComponentProps } from '../../context';
import ScrollList from '../../ScrollList';
import { STATIONS, tune, needlePct, markerPcts, playlistId, trackUrl, type ListStation, type PlaylistStation } from './stations';
import { RADIO_CSS } from './styles';

/** Inline tuning dial track with station marker lines and a sliding needle. */
function Dial({ idx }: { idx: number }) {
  const markers = markerPcts();
  const pct = needlePct(idx);
  return (
    <div className="radio-dial-track" aria-hidden="true">
      {markers.map((p, i) => (
        <div key={i} className="radio-dial-marker" style={{ left: `${p}%` }} />
      ))}
      <div className="radio-dial-needle" style={{ left: `${pct}%` }} />
    </div>
  );
}

/**
 * Top-screen portal while Ayush FM is active: a static station card first, the
 * Spotify iframe only after A (`loaded`), so no third-party frame loads until asked.
 *
 * The playlist URL is validated by playlistId(); anything not a valid
 * open.spotify.com playlist URL shows the placeholder frame instead of an iframe.
 */
function FmTop({ station, loaded }: { station: PlaylistStation; loaded: boolean }) {
  const topEl = typeof document !== 'undefined' ? document.querySelector('.top-screen') : null;
  const pid = playlistId(station.spotifyPlaylistUrl);
  const spotifyHref = pid ? `https://open.spotify.com/playlist/${pid}` : null;

  // Dim the world while FM is shown
  useEffect(() => {
    dim(true);
    return () => dim(false);
  }, []);

  const content = (
    <div className="radio-fm" data-testid="radio-fm-top">
      <div className="radio-fm-frame">
        {pid && !loaded ? (
          <div className="radio-fm-card" data-testid="radio-fm-card">
            <div className="radio-fm-card-name">{station.name}</div>
            <div className="radio-fm-card-sub">Playlist on Spotify</div>
            <div className="radio-fm-card-hint">A: load player</div>
          </div>
        ) : pid ? (
          <iframe
            src={`https://open.spotify.com/embed/playlist/${pid}`}
            width="100%"
            height="100%"
            allow="encrypted-media; clipboard-write"
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            loading="lazy"
            title="Ayush FM playlist on Spotify"
            style={{ border: 0, display: 'block', width: '100%', height: '100%' }}
          />
        ) : (
          <div className="radio-fm-placeholder" data-testid="radio-fm-placeholder">
            <span>Playlist coming</span>
          </div>
        )}
      </div>
      {/* Attribution row: always present (20px reserved), shows link when playlist is valid */}
      <div className="radio-fm-attr">
        {spotifyHref ? (
          <a href={spotifyHref} target="_blank" rel="noopener noreferrer" data-testid="radio-fm-open">
            Open in Spotify
          </a>
        ) : (
          <span aria-hidden="true">&nbsp;</span>
        )}
      </div>
    </div>
  );

  return topEl ? createPortal(content, topEl) : null;
}

type View = 'dial' | 'list' | 'fm';

/**
 * Radio overlay — HGSS Pokégear style.
 *
 * Views:
 *   dial  → tuning panel; ◀/▶ tune stations, A opens the station, B closes the radio
 *   list  → ScrollList of tracks (for "Now spinning"); A opens Spotify (valid URL), B returns to dial
 *   fm    → Ayush FM top-screen card; A loads the embed, A again opens Spotify; B returns to dial
 */
export default function Radio({ ctx }: OverlayComponentProps) {
  const { announce } = useOverlay();
  const [stationIdx, setStationIdx] = useState(0);
  const [view, setView] = useState<View>('dial');
  const [trackIdx, setTrackIdx] = useState(0);
  const [fmLoaded, setFmLoaded] = useState(false);

  const station = STATIONS[stationIdx]!;

  // Announce station name when tuning changes
  useEffect(() => {
    if (view === 'dial') {
      announce(`${station.name}. ${station.desc}`);
    }
  }, [stationIdx, view, station, announce]);

  const tuneLeft = () => setStationIdx((i) => tune(i, -1));
  const tuneRight = () => setStationIdx((i) => tune(i, 1));

  const openStation = () => {
    if (station.kind === 'list') {
      setTrackIdx(0);
      setView('list');
      announce(`Now Spinning. ${(station as ListStation).tracks.length} tracks. Use up and down to browse, A to open in Spotify.`);
    } else if (station.kind === 'playlist') {
      setFmLoaded(false);
      setView('fm');
      const pid = playlistId((station as PlaylistStation).spotifyPlaylistUrl);
      announce(pid ? 'Ayush FM. A to load the player. B to go back.' : 'Ayush FM. Playlist coming. B to close.');
    } else if (station.kind === 'object') {
      // Next tick: this key press must not reach the unfrozen world.
      // close() unfreezes, so goTo can path-find immediately after.
      const objectId = station.objectId;
      setTimeout(() => {
        ctx.close();
        goTo(objectId);
      }, 0);
    }
  };

  const openTrack = (i: number) => {
    const ls = station as ListStation;
    const track = ls.tracks[i];
    if (!track) return;
    const url = trackUrl(track.spotifyUrl);
    if (!url) return; // skip invalid URLs silently
    window.open(url, '_blank', 'noopener,noreferrer');
    const note = track.note ? ` ${track.note}` : '';
    announce(`Opened ${track.title} by ${track.artist}${note} in a new tab.`);
  };

  const openFmSpotify = () => {
    if (station.kind !== 'playlist') return;
    const pid = playlistId((station as PlaylistStation).spotifyPlaylistUrl);
    if (!pid) return;
    window.open(`https://open.spotify.com/playlist/${pid}`, '_blank', 'noopener,noreferrer');
    announce('Opened playlist in a new tab.');
  };

  const fmA = () => {
    if (!fmLoaded) {
      setFmLoaded(true);
      announce('Player loaded. A to open in Spotify.');
    } else {
      openFmSpotify();
    }
  };

  const goBack = () => {
    if (view !== 'dial') {
      setFmLoaded(false);
      setView('dial');
      announce(`${station.name}. ${station.desc}`);
    } else {
      ctx.close();
    }
  };

  // Input: dial view — left/right to tune, A to open station, B to close
  // list view — up/down navigate, A to open track in Spotify, B back to dial
  // fm view — A loads the player, then opens Spotify (if valid playlist), B back to dial
  const fmHasValidPlaylist = station.kind === 'playlist' && !!playlistId((station as PlaylistStation).spotifyPlaylistUrl);

  useOverlayInput(
    view === 'dial'
      ? {
          left: tuneLeft,
          right: tuneRight,
          a: openStation,
          b: goBack,
          labels: {
            a: station.kind === 'object' ? 'Go' : 'Listen',
            b: 'Close',
          },
        }
      : view === 'list'
        ? {
            up: () => {
              const ls = station as ListStation;
              setTrackIdx((i) => (i + ls.tracks.length - 1) % ls.tracks.length);
            },
            down: () => {
              const ls = station as ListStation;
              setTrackIdx((i) => (i + 1) % ls.tracks.length);
            },
            a: () => openTrack(trackIdx),
            b: goBack,
            labels: { a: 'Open', b: 'Back' },
          }
        : /* fm */ {
            a: fmHasValidPlaylist ? fmA : undefined,
            b: goBack,
            labels: fmHasValidPlaylist ? { a: fmLoaded ? 'Open' : 'Load', b: 'Back' } : { b: 'Back' },
          },
  );

  return (
    <>
      <style>{RADIO_CSS}</style>

      {/* FM top-screen portal (only while view === 'fm' and station is a playlist) */}
      {view === 'fm' && station.kind === 'playlist' && (
        <FmTop station={station as PlaylistStation} loaded={fmLoaded} />
      )}

      <div className="overlay radio" data-testid="radio" data-view={view}>
        <h2>RADIO</h2>

        {view === 'dial' && (
          <div className="radio-panel">
            {/* Tuning dial row: ◀ (flipped ▶) + dial track + ▶ */}
            <div className="radio-dial-row" role="group" aria-label="Tune station">
              <button
                type="button"
                className="radio-dial-btn radio-dial-btn-left"
                aria-label="Previous station"
                data-testid="radio-tune-left"
                onPointerDown={(e) => { e.preventDefault(); tuneLeft(); }}
                onClick={(e) => { if (e.detail === 0) tuneLeft(); }}
              >
                {/* ◀ not in HGSS font — flip ▶ (U+25B6) horizontally */}
                <span aria-hidden="true">▶</span>
              </button>
              <Dial idx={stationIdx} />
              <button
                type="button"
                className="radio-dial-btn"
                aria-label="Next station"
                data-testid="radio-tune-right"
                onPointerDown={(e) => { e.preventDefault(); tuneRight(); }}
                onClick={(e) => { if (e.detail === 0) tuneRight(); }}
              >
                <span aria-hidden="true">▶</span>
              </button>
            </div>

            <div
              className="radio-station-name"
              data-testid="radio-station-name"
              title={station.name}
            >
              {station.name}
            </div>
            <div
              className="radio-station-desc"
              data-testid="radio-station-desc"
              title={station.desc}
            >
              {station.desc}
            </div>
          </div>
        )}

        {view === 'list' && station.kind === 'list' && (
          <div className="radio-list">
            <ScrollList
              items={(station as ListStation).tracks.map((t, i) => ({
                key: `${i}-${t.title}`,
                /* "title · artist"; note is announced on open, not shown in the row */
                label: <span>{t.title} · {t.artist}</span>,
              }))}
              selected={trackIdx}
              onActivate={(i) => {
                setTrackIdx(i);
                openTrack(i);
              }}
            />
          </div>
        )}

        {view === 'fm' && (
          /* Bottom screen minimal while FM is on the top screen */
          <div className="radio-panel">
            <div className="radio-station-name">{station.name}</div>
            <div className="radio-station-desc">Playlist on Spotify</div>
          </div>
        )}
      </div>
    </>
  );
}
