import { useState, type FormEvent } from "react";
import type { Project } from "../types";
import { Button } from "../shared/ui/Button";
import { Card } from "../shared/ui/Card";
import { Dialog } from "../shared/ui/Dialog";
import { Input } from "../shared/ui/Input";
import { PageHeader } from "../shared/ui/PageHeader";
import { StatusBadge } from "../shared/ui/StatusBadge";
import { TextField } from "../shared/ui/TextField";

type HomeViewProps = {
  projects: Project[];
  onSelect: (project: Project) => void;
  onCreate: (name: string) => void;
  onUpdate: (projectId: string, name: string) => void;
  onDelete: (projectId: string) => void;
  actionError?: string;
  actionPending?: boolean;
};

export function HomeView({ projects, onSelect, onCreate, onUpdate, onDelete, actionError = "", actionPending = false }: HomeViewProps) {
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<Project | null>(null);
  const [editName, setEditName] = useState("");
  const [deleting, setDeleting] = useState<Project | null>(null);
  const documents = projects.reduce((total, project) => total + project.document_count, 0);
  const sentences = projects.reduce((total, project) => total + project.sentence_count, 0);

  const beginEdit = (project: Project) => {
    setEditing(project);
    setEditName(project.name);
  };
  const saveEdit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing || !editName.trim()) return;
    onUpdate(editing.id, editName.trim());
    setEditing(null);
  };
  const confirmDelete = () => {
    if (!deleting) return;
    onDelete(deleting.id);
    setDeleting(null);
  };

  return (
    <section className="home-view">
      <PageHeader className="home-heading" eyebrow="WORKSPACE OVERVIEW" title="Good to see you." description="Choose a project to continue writing, narrating, and exporting your audiobook." actions={<StatusBadge className="home-badge" dot tone="success">All systems connected</StatusBadge>} />
      {actionError && <div className="error-banner" role="alert">{actionError}</div>}
      <div className="overview-strip">
        <div><span>Projects</span><strong>{projects.length}</strong><small>Your audiobook workspaces</small></div>
        <div><span>Documents</span><strong>{documents.toLocaleString()}</strong><small>Imported source files</small></div>
        <div><span>Sentences</span><strong>{sentences.toLocaleString()}</strong><small>Ready to narrate</small></div>
      </div>
      <div className="section-heading"><div><div className="eyebrow">YOUR LIBRARY</div><h2>All projects</h2></div><span className="muted">Select a project from the cards or the sidebar.</span></div>
      <div className="project-grid">
        {projects.map((project) => (
          <Card as="article" className="project-card" key={project.id}>
            <div className="project-card-top">
              <span className="project-avatar large">{project.name.slice(0, 1).toUpperCase()}</span>
              <div className="project-card-actions">
                <Button variant="ghost" size="sm" onClick={() => beginEdit(project)}>Edit</Button>
                <Button variant="destructive" size="sm" onClick={() => setDeleting(project)}>Delete</Button>
              </div>
            </div>
            <Button className="project-card-open" variant="ghost" onClick={() => onSelect(project)} aria-label={`Open ${project.name}`}>
              <strong>{project.name}</strong>
              <span>{project.document_count} documents · {project.sentence_count.toLocaleString()} sentences</span>
              <small>Updated {new Date(project.updated_at).toLocaleDateString()}</small>
            </Button>
          </Card>
        ))}
        <Card as="section" className="project-card new-project">
          <span className="new-project-icon">+</span>
          <strong>Start a new project</strong>
          <span>Give your next audiobook a home.</span>
          <form onSubmit={(event) => { event.preventDefault(); if (name.trim()) { onCreate(name.trim()); setName(""); } }}>
            <Input aria-label="Project name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Project name" />
            <Button type="submit" loading={actionPending} loadingLabel="Creating…">Create workspace</Button>
          </form>
        </Card>
      </div>

      <Dialog open={Boolean(editing)} title="Edit project" description="Update the name shown across your audiobook workspace." onClose={() => setEditing(null)} footer={<><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" form="project-edit-form" loading={actionPending} loadingLabel="Saving…">Save changes</Button></>}>
        <form id="project-edit-form" onSubmit={saveEdit}>
          <TextField label="Project name" value={editName} onValueChange={setEditName} required autoFocus />
        </form>
      </Dialog>

      <Dialog open={Boolean(deleting)} title="Delete project?" description={`This permanently removes ${deleting?.name ?? "this project"}, its documents, sentences, speakers, and exports.`} onClose={() => setDeleting(null)} footer={<><Button variant="ghost" onClick={() => setDeleting(null)}>Cancel</Button><Button variant="destructive" onClick={confirmDelete} loading={actionPending} loadingLabel="Deleting…">Delete project</Button></>}>
        <p className="dialog-warning">This action cannot be undone.</p>
      </Dialog>
    </section>
  );
}
