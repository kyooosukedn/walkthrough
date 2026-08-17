import { useState } from "react";

interface LayoutProps {
  children: React.ReactNode;
  topBar?: React.ReactNode;
  sidebar?: React.ReactNode;
}

export function Layout({ children, topBar, sidebar }: LayoutProps) {
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {topBar}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {sidebar}
        <div style={{ flex: 1, overflow: "hidden" }}>{children}</div>
      </div>
    </div>
  );
}
