// Settings > Graphics (GTA-style): pick a preset for your PC or tune each option. Changes apply live; the
// anti-aliasing and shadow switches restart the 3D view (a second's blink), like GTA's "requires restart" items.
import { PRESETS, detectPreset, dynRes, useGraphics } from "../../game/settings.ts";
import type { Graphics, Preset } from "../../game/settings.ts";
import { setAudioSettings, useAudioSettings } from "../../game/audio.ts";

const PRESET_LABEL: Record<Exclude<Preset, "custom">, string> = { low: "Low", medium: "Medium", high: "High", ultra: "Ultra" };

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="set-row"><span>{label}{hint && <small>{hint}</small>}</span>{children}</label>;
}

export function SettingsPanel() {
  const g = useGraphics();
  const audio = useAudioSettings((s) => s.s);
  const set = (p: Partial<Graphics>) => g.set(p);
  const suggested = detectPreset();
  return (
    <div className="settings">
      <h3>GRAPHICS PRESET {g.preset === "custom" && <small>· custom</small>}</h3>
      <div className="presets">
        {(Object.keys(PRESETS) as Exclude<Preset, "custom">[]).map((p) => (
          <button key={p} className={g.preset === p ? "sel" : ""} onClick={() => g.applyPreset(p)}>
            {PRESET_LABEL[p]}{p === suggested ? " ★" : ""}
          </button>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>★ = suggested for this computer. Low suits laptop graphics (Intel HD); Ultra needs a gaming graphics card.</p>

      <h3>DISPLAY</h3>
      <Row label="Resolution scale" hint={`${Math.round(g.resolution * 100)}% of the screen${g.dynamicRes ? ` · now ${Math.round(g.resolution * dynRes.scale * 100)}%` : ""}`}>
        <input type="range" min={0.5} max={1.5} step={0.05} value={g.resolution} onChange={(e) => set({ resolution: Number(e.target.value) })} />
      </Row>
      <Row label="Dynamic resolution" hint="Drops the resolution when the frame rate dips">
        <input type="checkbox" checked={g.dynamicRes} onChange={(e) => set({ dynamicRes: e.target.checked })} />
      </Row>
      <Row label="Anti-aliasing" hint="Smoother edges (restarts the 3D view)">
        <input type="checkbox" checked={g.antialias} onChange={(e) => set({ antialias: e.target.checked })} />
      </Row>
      <Row label="Shadows" hint="Real-time shadows (restarts the 3D view)">
        <input type="checkbox" checked={g.shadows} onChange={(e) => set({ shadows: e.target.checked })} />
      </Row>
      <Row label="Show FPS" hint="Frames per second, top of the screen">
        <input type="checkbox" checked={g.showFps} onChange={(e) => set({ showFps: e.target.checked })} />
      </Row>

      <h3>WORLD</h3>
      <Row label="View distance" hint={`${(g.viewDistance / 1000).toFixed(1)} km of haze-free view`}>
        <input type="range" min={600} max={3200} step={100} value={g.viewDistance} onChange={(e) => set({ viewDistance: Number(e.target.value) })} />
      </Row>
      <Row label="Traffic density" hint={`${g.traffic} cars on the highways around you (applies on next load)`}>
        <input type="range" min={4} max={30} step={1} value={g.traffic} onChange={(e) => set({ traffic: Number(e.target.value) })} />
      </Row>
      <Row label="Pedestrian density" hint={`${g.crowd} extra people on the streets (applies on next load)`}>
        <input type="range" min={0} max={10} step={1} value={g.crowd} onChange={(e) => set({ crowd: Number(e.target.value) })} />
      </Row>
      <Row label="Effects quality" hint="Blood, sparks, smoke, explosions">
        <select value={g.effects} onChange={(e) => set({ effects: e.target.value as Graphics["effects"] })}>
          <option value="low">Low</option><option value="high">High</option>
        </select>
      </Row>
      <Row label="Night lighting" hint="Street-lamp pools and headlight beams">
        <input type="checkbox" checked={g.nightLights} onChange={(e) => set({ nightLights: e.target.checked })} />
      </Row>

      <h3>AUDIO</h3>
      <Row label="Master volume" hint={`${Math.round(audio.volume * 100)}% · everything`}>
        <input type="range" min={0} max={1} step={0.05} value={audio.volume} onChange={(e) => setAudioSettings({ volume: Number(e.target.value) })} />
      </Row>
      <Row label="Music volume" hint={`${Math.round(audio.music * 100)}% · theme and radio`}>
        <input type="range" min={0} max={1} step={0.05} value={audio.music} onChange={(e) => setAudioSettings({ music: Number(e.target.value) })} />
      </Row>
      <Row label="Theme music" hint="Background theme at the desk and on foot (SALIK FM still plays in cars)">
        <input type="checkbox" checked={audio.theme} onChange={(e) => setAudioSettings({ theme: e.target.checked })} />
      </Row>
      <Row label="Mute all">
        <input type="checkbox" checked={audio.muted} onChange={(e) => setAudioSettings({ muted: e.target.checked })} />
      </Row>
    </div>
  );
}
