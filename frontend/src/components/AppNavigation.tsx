import { useEffect, useRef } from "react";
import type { AppView, SettingsTab, Tab } from "../app-types";
import type { Project } from "../types";

export function SidebarToggle({ open, onClick, label, controls }: { open: boolean; onClick: () => void; label: string; controls: string }) {
  return <button className="ghost sidebar-toggle" type="button" aria-label={`${open ? "Close" : "Open"} ${label} sidebar`} aria-expanded={open} aria-controls={controls} title={`${open ? "Hide" : "Show"} ${label}`} onClick={onClick}><span aria-hidden="true">{open ? "‹" : "›"}</span><span className="toggle-label">{open ? "Hide" : "Show"} {label}</span></button>;
}

type TopbarProps = {
  view: AppView;
  project: Project | null;
  settingsSidebarOpen: boolean;
  onToggleSettingsSidebar: () => void;
  narrationSidebarOpen: boolean;
  onToggleNarrationSidebar: () => void;
  sentenceView: boolean;
  sentenceTotal: number;
  sentenceSpeakerCount: number;
  sentenceSelectedCount: number;
  sentenceQuery: string;
  onSentenceQuery: (value: string) => void;
  sentenceMoreOpen: boolean;
  onToggleSentenceMore: () => void;
  onCloseSentenceMore: () => void;
  onSelectAllSentences: () => void;
  onClearSentenceSelection: () => void;
  onRefreshSentences: () => void;
  onGenerateSentences: () => void;
};

export function Topbar({ view, project, settingsSidebarOpen, onToggleSettingsSidebar, narrationSidebarOpen, onToggleNarrationSidebar, sentenceView, sentenceTotal, sentenceSpeakerCount, sentenceSelectedCount, sentenceQuery, onSentenceQuery, sentenceMoreOpen, onToggleSentenceMore, onCloseSentenceMore, onSelectAllSentences, onClearSentenceSelection, onRefreshSentences, onGenerateSentences }: TopbarProps) {
  const pageTitle = view === "home" ? "Your projects" : view === "settings" ? "Settings" : view === "health" ? "Server health" : project?.name ?? "Project";
  return <header className={`topbar ${sentenceView ? "sentence-topbar" : ""}`}>
    {sentenceView && project ? <><div className="sentence-project-details"><span className="project-avatar large">{project.name.slice(0, 1).toUpperCase()}</span><div><div className="eyebrow">{project.document_count} DOCUMENTS · PROJECT</div><h1>{project.name}</h1><span>{sentenceTotal.toLocaleString()} sentences · {sentenceSpeakerCount.toLocaleString()} speakers</span></div></div><TopbarActions query={sentenceQuery} onQuery={onSentenceQuery} narrationSidebarOpen={narrationSidebarOpen} onToggleNarrationSidebar={onToggleNarrationSidebar} moreOpen={sentenceMoreOpen} onToggleMore={onToggleSentenceMore} onCloseMore={onCloseSentenceMore} onSelectAll={onSelectAllSentences} onClearSelection={onClearSentenceSelection} onRefresh={onRefreshSentences} selectedCount={sentenceSelectedCount} canSelectAll={Boolean(sentenceTotal)} onGenerate={onGenerateSentences} /></> : <><div className="topbar-leading"><div><div className="eyebrow">AUDIOBOOK MAKER</div><strong>{pageTitle}</strong></div></div><div className="topbar-actions">{view === "settings" && <SidebarToggle open={settingsSidebarOpen} onClick={onToggleSettingsSidebar} label="engine settings" controls="settings-sidebar" />}</div></>}
  </header>;
}

type TopbarActionsProps = {
  query: string;
  onQuery: (value: string) => void;
  narrationSidebarOpen: boolean;
  onToggleNarrationSidebar: () => void;
  moreOpen: boolean;
  onToggleMore: () => void;
  onCloseMore: () => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onRefresh: () => void;
  selectedCount: number;
  canSelectAll: boolean;
  onGenerate: () => void;
};

export function TopbarActions({ query, onQuery, narrationSidebarOpen, onToggleNarrationSidebar, moreOpen, onToggleMore, onCloseMore, onSelectAll, onClearSelection, onRefresh, selectedCount, canSelectAll, onGenerate }: TopbarActionsProps) {
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeMenu = () => { onCloseMore(); moreButtonRef.current?.focus(); };
  const toggleMenu = () => { if (moreOpen) closeMenu(); else onToggleMore(); };
  const selectAll = () => { onSelectAll(); closeMenu(); };
  const clearSelection = () => { onClearSelection(); closeMenu(); };
  const refresh = () => { onRefresh(); closeMenu(); };
  useEffect(() => {
    if (!moreOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") closeMenu(); };
    const closeOnOutsideClick = (event: MouseEvent) => { const target = event.target as Node; if (!menuRef.current?.contains(target) && !moreButtonRef.current?.contains(target)) closeMenu(); };
    window.addEventListener("keydown", closeOnEscape); document.addEventListener("mousedown", closeOnOutsideClick);
    return () => { window.removeEventListener("keydown", closeOnEscape); document.removeEventListener("mousedown", closeOnOutsideClick); };
  }, [moreOpen, onCloseMore]);
  return <div className="topbar-actions sentence-topbar-actions"><label className="search-field"><span>Search sentences</span><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="Search sentences…" /></label><SidebarToggle open={narrationSidebarOpen} onClick={onToggleNarrationSidebar} label="narration settings" controls="narration-sidebar" /><div className="action-menu-wrap"><button ref={moreButtonRef} className="ghost" type="button" aria-expanded={moreOpen} aria-haspopup="menu" aria-controls="sentence-more-menu" onClick={toggleMenu}>More <span className="menu-chevron">⌄</span></button>{moreOpen && <div ref={menuRef} id="sentence-more-menu" className="action-menu" role="menu"><button type="button" role="menuitem" disabled={!canSelectAll} onClick={selectAll}>Select all on page</button><button type="button" role="menuitem" disabled={!selectedCount} onClick={clearSelection}>Clear selection</button><button type="button" role="menuitem" onClick={refresh}>Refresh sentences</button></div>}</div><button className="primary" type="button" disabled={!selectedCount} onClick={onGenerate}>Generate {selectedCount || "selected"}</button></div>;
}

type WorkspaceSidebarProps = {
  open: boolean;
  onToggle: () => void;
  projects: Project[];
  project: Project | null;
  view: AppView;
  tab: Tab;
  onHome: () => void;
  onProject: (project: Project) => void;
  onTab: (tab: Tab) => void;
  onSettings: (section?: SettingsTab) => void;
};

export function WorkspaceSidebar({ open, onToggle, projects, project, view, tab, onHome, onProject, onTab, onSettings }: WorkspaceSidebarProps) {
  const projectTabItems: Array<{ id: Exclude<Tab, "health">; icon: string }> = [{ id: "documents", icon: "▣" }, { id: "sentences", icon: "≡" }, { id: "speakers", icon: "◉" }, { id: "queue", icon: "↗" }, { id: "export", icon: "⇩" }];
  return <aside id="workspace-sidebar" className="workspace-sidebar" aria-label="Workspace navigation"><div className="sidebar-brand"><span className="brand-mark">AM</span><div><strong>Audiobook</strong><span>Maker Studio</span></div><button className="sidebar-collapse-button" type="button" aria-label={`${open ? "Collapse" : "Expand"} workspace sidebar`} aria-expanded={open} aria-controls="workspace-sidebar" title={`${open ? "Collapse" : "Expand"} workspace sidebar`} onClick={onToggle}><span aria-hidden="true">{open ? "‹" : "›"}</span></button></div><nav className="sidebar-nav" aria-label="Primary navigation"><button className={`sidebar-item ${view === "home" ? "active" : ""}`} type="button" data-tooltip="Home" onClick={onHome}><span className="nav-icon" aria-hidden="true">⌂</span><span className="sidebar-label">Home</span></button></nav><div className="sidebar-section"><div className="sidebar-section-title"><span className="sidebar-label">Projects</span><span className="sidebar-count" aria-label={`${projects.length} projects`}>{projects.length}</span></div><div className="project-nav-list">{projects.map((item) => <button className={`sidebar-item project-item ${view === "project" && project?.id === item.id ? "active" : ""}`} type="button" data-tooltip={item.name} key={item.id} onClick={() => onProject(item)}><span className="project-avatar" aria-hidden="true">{item.name.slice(0, 1).toUpperCase()}</span><span className="project-nav-name sidebar-label">{item.name}</span><span className="project-nav-count">{item.document_count}</span></button>)}{!projects.length && <span className="sidebar-empty">Create your first audiobook project.</span>}</div></div>{view === "project" && project && <div className="sidebar-section project-navigation"><div className="sidebar-section-title"><span className="sidebar-label">Current project</span></div>{projectTabItems.map((item) => <button className={`sidebar-item nested-item ${tab === item.id ? "active" : ""}`} type="button" data-tooltip={item.id[0].toUpperCase() + item.id.slice(1)} key={item.id} onClick={() => onTab(item.id)}><span className="nav-icon" aria-hidden="true">{item.icon}</span><span className="sidebar-label">{item.id[0].toUpperCase() + item.id.slice(1)}</span></button>)}</div>}<div className="sidebar-spacer" /><div className="sidebar-section sidebar-bottom"><div className="sidebar-section-title"><span className="sidebar-label">System</span></div><button className={`sidebar-item ${view === "health" ? "active" : ""}`} type="button" data-tooltip="Server health" onClick={() => onTab("health")}><span className="nav-icon" aria-hidden="true">◌</span><span className="sidebar-label">Server health</span></button><button className={`sidebar-item ${view === "settings" ? "active" : ""}`} type="button" data-tooltip="Settings" onClick={() => onSettings()}><span className="nav-icon" aria-hidden="true">⚙</span><span className="sidebar-label">Settings</span></button></div></aside>;
}

export function SidebarControlDock({ settingsSidebarOpen, onToggleSettingsSidebar }: { settingsSidebarOpen: boolean; onToggleSettingsSidebar: () => void }) {
  return <div className="sidebar-control-dock" role="group" aria-label="Engine settings controls"><SidebarToggle open={settingsSidebarOpen} onClick={onToggleSettingsSidebar} label="engine settings" controls="settings-sidebar" /></div>;
}
