"use client";

const commit = process.env.NEXT_PUBLIC_GIT_COMMIT ?? "dev";
const buildTime = process.env.NEXT_PUBLIC_BUILD_TIME ?? "";

export function BuildInfo() {
  if (!commit && !buildTime) return null;

  return (
    <div className="build-info">
      {commit !== "dev" ? (
        <a
          className="build-commit"
          href={`https://github.com/caoyangim/TodoList/commit/${commit}`}
          rel="noopener noreferrer"
          target="_blank"
        >
          {commit.slice(0, 7)}
        </a>
      ) : (
        <span className="build-commit">{commit}</span>
      )}
      {buildTime && (
        <time className="build-time" dateTime={buildTime}>
          {buildTime}
        </time>
      )}
    </div>
  );
}
