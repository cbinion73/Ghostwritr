"use client";

import { useState } from "react";

type CollapsibleRightbarProps = {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
};

export function CollapsibleRightbar({
  title,
  children,
  defaultOpen = true,
}: CollapsibleRightbarProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <aside className={`glass-panel rightbar collapsible-rightbar ${open ? "open" : "collapsed"}`}>
      <div className="rightbar-toggle-wrap">
        <button
          aria-expanded={open}
          className="rightbar-toggle"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          <span className="rightbar-toggle-paperclip" aria-hidden="true">
            {open ? "Paperclip" : "📎"}
          </span>
          <span className="rightbar-toggle-title">{open ? title : "Paperclip"}</span>
          <span className="rightbar-toggle-icon" aria-hidden="true">
            {open ? "Hide" : "Open"}
          </span>
        </button>
      </div>

      {open ? <div className="rightbar-body">{children}</div> : null}
    </aside>
  );
}
