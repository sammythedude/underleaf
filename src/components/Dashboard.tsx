import { useState } from 'react';
import type { ProjectSummary } from '../../shared/types';

interface Props {
  recentProjects: ProjectSummary[];
  onOpenDialog: () => void;
  onOpenRecent: (path: string) => void;
  onCreateProject: (name: string, dir: string) => void;
  onPickDirectory: () => Promise<string | null>;
}

export function Dashboard({ recentProjects, onOpenDialog, onOpenRecent, onCreateProject, onPickDirectory }: Props) {
  const [name, setName]   = useState('My Paper');
  const [dir, setDir]     = useState<string | null>(null);

  return (
    <div className="dash-shell">
      <div className="dash-inner">

        {/* Brand */}
        <div className="dash-top">
          <div className="dash-logo">U</div>
          <div className="dash-brand">
            <div className="dash-brand-name">Underleaf</div>
            <div className="dash-brand-tag">Local-first LaTeX editor</div>
          </div>
        </div>

        <h1 className="dash-headline">Write LaTeX.<br />See it instantly.</h1>
        <p className="dash-sub">
          Edit visually or in source, preview live, and compile a pixel-perfect PDF — all local, all offline.
        </p>

        <div className="dash-actions">
          <button className="btn-primary" onClick={onOpenDialog}>
            Open Project Folder
          </button>
          <button className="btn-ghost" onClick={async () => {
            const d = await onPickDirectory();
            if (d) setDir(d);
          }}>
            Choose Location
          </button>
        </div>

        <div className="dash-grid">

          {/* Create */}
          <div className="dash-card">
            <div className="dash-card-hd">
              <span className="dash-card-hd-icon">✦</span>
              New Project
            </div>
            <div className="dash-card-body">
              <div className="form-row">
                <label htmlFor="proj-name">Project name</label>
                <input
                  id="proj-name"
                  className="form-input"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="My Paper"
                />
              </div>
              <div className="form-row">
                <label>Parent folder</label>
                <button
                  className={`folder-btn ${dir ? 'set' : ''}`}
                  onClick={async () => { const d = await onPickDirectory(); if (d) setDir(d); }}
                >
                  {dir ? `📁 ${dir}` : '📁  Choose a folder…'}
                </button>
              </div>
              <button
                className="btn-primary"
                disabled={!name.trim() || !dir}
                onClick={() => { if (dir) onCreateProject(name.trim(), dir); }}
              >
                Create Starter Project
              </button>
            </div>
          </div>

          {/* Recents */}
          <div className="dash-card">
            <div className="dash-card-hd">
              <span className="dash-card-hd-icon">◷</span>
              Recent Projects
            </div>
            {recentProjects.length === 0 ? (
              <div className="dash-empty">
                Open or create a project — it will appear here for fast access.
              </div>
            ) : (
              <div className="recent-list">
                {recentProjects.map(p => (
                  <button
                    key={p.projectPath}
                    className="recent-item"
                    onClick={() => onOpenRecent(p.projectPath)}
                  >
                    <span className="recent-icon">📄</span>
                    <span className="recent-info">
                      <span className="recent-name">{p.name}</span>
                      <span className="recent-path">{p.projectPath}</span>
                    </span>
                    <span className="recent-arrow">›</span>
                  </button>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
