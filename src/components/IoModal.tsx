import type { JSX } from 'react';
import { t } from '../i18n';
import { studio, useStudio } from '../store/studio';

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}): JSX.Element {
  return (
    <button
      type="button"
      className={`switch-row ${checked ? 'on' : ''}`}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
    >
      <span>{label}</span>
      <span className="switch-track">
        <span className="switch-thumb" />
      </span>
    </button>
  );
}

export function IoModal({ inputLevel }: { inputLevel: number }): JSX.Element {
  const state = useStudio();
  const { lang, io, project } = state;
  const inputs = io.devices.filter((device) => device.kind === 'audioinput');
  const outputs = io.devices.filter((device) => device.kind === 'audiooutput');

  return (
    <>
      <section className="io-block">
        <h3>{t(lang, 'io.inputDevice')}</h3>
        <div className="inline-row">
          <select
            className="select"
            value={io.inputDeviceId}
            onChange={(event) => void studio.setInputDevice(event.target.value)}
            aria-label={t(lang, 'io.inputDevice')}
          >
            <option value="">{t(lang, 'io.defaultDevice')}</option>
            {inputs.map((device, index) => (
              <option key={device.deviceId || index} value={device.deviceId}>
                {device.label || `${t(lang, 'io.inputDevice')} ${index + 1}`}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={`primary-btn small ${io.mic === 'granted' ? 'ghost' : ''}`}
            onClick={() => void studio.requestMic()}
          >
            {t(lang, io.mic === 'granted' ? 'io.micGranted' : 'io.enableMic')}
          </button>
        </div>
        {io.mic === 'denied' && <p className="hint warn">{t(lang, 'io.micDenied')}</p>}
        {!inputs.length && <p className="hint">{t(lang, 'io.noDevices')}</p>}

        <label className="fx-slider">
          <span className="fx-name">{t(lang, 'io.inputGain')}</span>
          <input
            type="range"
            min={0}
            max={200}
            value={Math.round(io.inputGain * 100)}
            onChange={(event) => studio.setInputGain(Number(event.target.value) / 100)}
            aria-label={t(lang, 'io.inputGain')}
          />
          <span className="tabular fx-value">{Math.round(io.inputGain * 100)}%</span>
        </label>
        <div className="peak-row">
          <span className="field-label">{t(lang, 'io.peak')}</span>
          <div className="meter-track tall">
            <div className="meter-fill input" style={{ width: `${Math.min(100, inputLevel * 118)}%` }} />
          </div>
        </div>

        <div className="seg wide">
          <button
            type="button"
            className={io.channelMode === 'mono' ? 'on' : ''}
            onClick={() => studio.setChannelMode('mono')}
          >
            {t(lang, 'io.mono')}
          </button>
          <button
            type="button"
            className={io.channelMode === 'stereo' ? 'on' : ''}
            onClick={() => studio.setChannelMode('stereo')}
          >
            {t(lang, 'io.stereo')}
          </button>
        </div>
      </section>

      <section className="io-block">
        <h3>{t(lang, 'io.processing')}</h3>
        <Switch
          label={t(lang, 'io.echo')}
          checked={io.processing.echoCancellation}
          onChange={(value) => studio.setProcessing({ echoCancellation: value })}
        />
        <Switch
          label={t(lang, 'io.noise')}
          checked={io.processing.noiseSuppression}
          onChange={(value) => studio.setProcessing({ noiseSuppression: value })}
        />
        <Switch
          label={t(lang, 'io.agc')}
          checked={io.processing.autoGainControl}
          onChange={(value) => studio.setProcessing({ autoGainControl: value })}
        />
        <p className="hint">{t(lang, 'io.processingHint')}</p>
      </section>

      <section className="io-block">
        <h3>{t(lang, 'io.latency')}</h3>
        <label className="fx-slider">
          <span className="fx-name">{t(lang, 'io.latency')}</span>
          <input
            type="range"
            min={-150}
            max={150}
            value={project.latencyMs}
            onChange={(event) => studio.setLatency(Number(event.target.value))}
            aria-label={t(lang, 'io.latency')}
          />
          <span className="tabular fx-value">{project.latencyMs > 0 ? `+${project.latencyMs}` : project.latencyMs} ms</span>
        </label>
        <p className="hint">{t(lang, 'io.latencyHint')}</p>
      </section>

      <section className="io-block">
        <h3>{t(lang, 'io.sampleRate')}</h3>
        <div className="inline-row">
          <select
            className="select"
            value={io.sampleRateChoice}
            onChange={(event) => studio.setSampleRateChoice(Number(event.target.value) as 44100 | 48000)}
            aria-label={t(lang, 'io.sampleRate')}
          >
            <option value={44100}>44.1 kHz</option>
            <option value={48000}>48 kHz</option>
          </select>
          <span className="status-chip">
            {t(lang, 'io.contextRate')} · {(io.contextRate / 1000).toFixed(1)} kHz
          </span>
          <button type="button" className="ghost-btn" onClick={() => void studio.restartEngine()}>
            {t(lang, 'io.engineRestart')}
          </button>
        </div>
        <p className="hint">{t(lang, 'io.rateHint')}</p>
      </section>

      <section className="io-block">
        <h3>{t(lang, 'io.outputDevice')}</h3>
        <div className="inline-row">
          <select
            className="select"
            value={io.outputDeviceId}
            onChange={(event) => void studio.setOutputDevice(event.target.value)}
            disabled={!io.outputSupported}
            aria-label={t(lang, 'io.outputDevice')}
          >
            <option value="">{t(lang, 'io.defaultDevice')}</option>
            {outputs.map((device, index) => (
              <option key={device.deviceId || index} value={device.deviceId}>
                {device.label || `${t(lang, 'io.outputDevice')} ${index + 1}`}
              </option>
            ))}
          </select>
        </div>
        {!io.outputSupported && <p className="hint warn">{t(lang, 'io.outputUnsupported')}</p>}
      </section>
    </>
  );
}
