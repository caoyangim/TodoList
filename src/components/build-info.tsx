"use client";

import { useEffect, useState } from "react";

type BuildMeta = {
  commit?: string;
  time?: string;
};

function Fallback() {
  return (
    <div className="build-info">
      <span className="build-commit">dev</span>
    </div>
  );
}

export function BuildInfo() {
  const [meta, setMeta] = useState<BuildMeta | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch("/build-info.json")
      .then((res) => {
        if (!res.ok) throw new Error("not found");
        return res.json();
      })
      .then((data: BuildMeta) => setMeta(data))
      .catch(() => setError(true));
  }, []);

  if (error) return <Fallback />;
  if (!meta) return null;

  const { commit, time } = meta;
  if (!commit && !time) return null;

  return (
    <div className="build-info">
      {commit ? (
        <a
          className="build-commit"
          href={`https://github.com/caoyangim/TodoList/commit/${commit}`}
          rel="noopener noreferrer"
          target="_blank"
        >
          {commit.slice(0, 7)}
        </a>
      ) : null}
      {time && (
        <time className="build-time" dateTime={time}>
          {time}
        </time>
      )}
    </div>
  );
}
