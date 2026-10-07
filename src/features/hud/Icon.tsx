// Line icons for the HUD (24px grid, stroke = currentColor). Emoji render differently on every PC and read as
// cheap; one consistent icon set is a big part of a premium-looking interface.
const PATHS: Record<string, string> = {
  walk: "M13 4a1.5 1.5 0 1 0 0-.01M10 21l2-6 3 3v3M8 12l2-4 4 1 2 3 2 1M12 15l-1-4",
  desk: "M4 10h16M6 10v9M18 10v9M8 6h8v4H8z",
  target: "M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18M12 7a5 5 0 1 0 0 10 5 5 0 1 0 0-10M12 11a1 1 0 1 0 0 2 1 1 0 1 0 0-2",
  map: "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14",
  car: "M5 16h14M3 16v-3l2-5h14l2 5v3M7 16v2M17 16v2M7.5 13h.01M16.5 13h.01",
  user: "M12 4a4 4 0 1 0 0 8 4 4 0 1 0 0-8M4 21c1-4 4-6 8-6s7 2 8 6",
  trophy: "M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M9 17h6v3H9z",
  plus: "M12 5v14M5 12h14",
  gear: "M12 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6M19 12l2-1-1-3-2 .2-1.3-1.3L17 5l-3-1-1 2h-2L10 4 7 5l.3 1.9L6 8.2 4 8l-1 3 2 1v0l-2 1 1 3 2-.2 1.3 1.3L7 19l3 1 1-2h2l1 2 3-1-.3-1.9 1.3-1.3 2 .2 1-3z",
  volume: "M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11",
  mute: "M4 9h4l5-4v14l-5-4H4zM16 9l5 6M21 9l-5 6",
  music: "M9 18V5l11-2v13M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3zM20 16a3 3 0 1 1-3-3 3 3 0 0 1 3 3z",
  musicOff: "M9 18V5l11-2v13M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3zM3 3l18 18",
  menu: "M4 7h16M4 12h16M4 17h16",
  play: "M7 4v16l13-8z",
  chart: "M4 20h16M7 16v-5M12 16V7M17 16v-8",
  close: "M6 6l12 12M18 6 6 18",
  fire: "M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-4 2-7 2 1 3 3 3 5 1-2 1-6 1-9z",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg className="ico" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  );
}
