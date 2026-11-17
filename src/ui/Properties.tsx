import { type ReactNode, useState } from "react";

import type { ComponentInfo, Manifest, PropInfo, TokenDefinition } from "../shared/manifest";
import { t, useMessages } from "./i18n";
import { JsonInput } from "./JsonInput";
import { type PropValues, sampleText } from "./prop-values";
import { resolveValue } from "./token-groups";
import { describeControl, TokenSample } from "./Viewport";
import { providerId, setProviderProp, toggleProvider, useEnabledProviders } from "./wrappers";

/** Blender 式面板，点击标题可以折叠。 */
export const Panel = ({ title, children }: { title: string; children: ReactNode }) => {
  const [open, setOpen] = useState(true);
  return (
    <section className="pp-panel">
      <button aria-expanded={open} className="pp-head" onClick={() => setOpen(!open)} type="button">
        <span aria-hidden="true">{open ? "▾" : "▸"}</span>
        {title}
      </button>
      {open && <div className="pp-body">{children}</div>}
    </section>
  );
};

const Row = ({
  label,
  title,
  wide = false,
  children,
}: {
  label: string;
  title?: string;
  /** 名字在上、内容在下，内容占满一行（JSON 的输入框用） */
  wide?: boolean;
  children: ReactNode;
}) => (
  <div className="pp-row" data-wide={wide || undefined}>
    <span title={title ?? label}>{label}</span>
    <div className="pp-value">{children}</div>
  </div>
);

const TokenRow = ({ token, tokens }: { token: TokenDefinition; tokens: TokenDefinition[] }) => (
  <Row label={token.name.replace(/^--/, "")} title={token.name}>
    <TokenSample size="small" token={token} tokens={tokens} />
    <code>{resolveValue(token.value, tokens)}</code>
  </Row>
);

/** 改了一个 prop。value 为 undefined 时表示不传 */
export type PropChange = (name: string, value: PropValues[string] | undefined) => void;

/** 对象、数组的 prop：不传，或者自己写 JSON */
const DataInput = ({
  prop,
  value,
  onChange,
}: {
  prop: PropInfo;
  value: PropValues[string] | undefined;
  onChange: PropChange;
}) => {
  const m = useMessages().props;
  const sample = prop.control.kind === "data" ? sampleText(prop.control.sample) : "null";
  // 以前选过 Mock 数据（现在不用了）的当作没填
  const text = typeof value === "string" ? value : undefined;
  return (
    <div className="pp-data">
      <select
        aria-label={m.dataSource(prop.name)}
        className="pp-input"
        onChange={(event) =>
          onChange(prop.name, event.target.value === "none" ? undefined : (text ?? sample))
        }
        value={text === undefined ? "none" : "json"}
      >
        {!prop.required && <option value="none">{m.notPassed}</option>}
        <option value="json">{m.writeJson}</option>
      </select>
      {text !== undefined && (
        <JsonInput
          label={m.valueOf(prop.name)}
          onValid={(next) => onChange(prop.name, next)}
          text={text}
        />
      )}
    </div>
  );
};

/** 按 prop 的类型给出能编辑的控件 */
const PropControlInput = ({
  prop,
  value,
  onChange,
}: {
  prop: PropInfo;
  value: PropValues[string] | undefined;
  onChange: PropChange;
}) => {
  const { control } = prop;
  const m = useMessages().props;
  const label = m.valueOf(prop.name);
  switch (control.kind) {
    case "select":
      return (
        <select
          aria-label={label}
          className="pp-input"
          onChange={(e) => onChange(prop.name, e.target.value === "" ? undefined : e.target.value)}
          value={typeof value === "string" ? value : ""}
        >
          {!prop.required && <option value="">{m.notPassed}</option>}
          {control.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    case "toggle":
      return (
        <input
          aria-label={label}
          checked={value === true}
          onChange={(e) => onChange(prop.name, e.target.checked)}
          type="checkbox"
        />
      );
    case "number":
      return (
        <input
          aria-label={label}
          className="pp-input"
          onChange={(e) =>
            onChange(prop.name, e.target.value === "" ? undefined : Number(e.target.value))
          }
          placeholder={m.notPassed}
          type="number"
          value={typeof value === "number" ? value : ""}
        />
      );
    case "text":
    case "slot":
      return (
        <input
          aria-label={label}
          className="pp-input"
          onChange={(e) =>
            onChange(
              prop.name,
              e.target.value === "" && !prop.required ? undefined : e.target.value
            )
          }
          placeholder={control.kind === "slot" ? m.slotPlaceholder : m.notPassed}
          type="text"
          value={typeof value === "string" ? value : ""}
        />
      );
    case "function":
      return <span className="pp-mute">{m.functionHint}</span>;
    case "data":
      return <DataInput onChange={onChange} prop={prop} value={value} />;
    case "unknown":
      return (
        <span className="pp-mute" title={control.type}>
          {m.notEditable(control.type)}
        </span>
      );
  }
};

/** 一组 props，每个一行。onChange 没有时只显示类型，不能改 */
const PropRows = ({
  props,
  values,
  onChange,
}: {
  props: PropInfo[];
  values: PropValues;
  onChange: PropChange | undefined;
}) =>
  props.map((prop) => (
    <Row
      key={prop.name}
      label={`${prop.name}${prop.required ? "" : "?"}`}
      title={[
        describeControl(prop.control),
        prop.defaultValue !== undefined ? t().props.defaultValue(prop.defaultValue) : "",
        prop.description ?? "",
      ]
        .filter(Boolean)
        .join("\n")}
      wide={onChange !== undefined && prop.control.kind === "data"}
    >
      {onChange ? (
        <PropControlInput onChange={onChange} prop={prop} value={values[prop.name]} />
      ) : (
        <span>{describeControl(prop.control)}</span>
      )}
    </Row>
  ));

/** 外层 Provider：勾选的会包在所有组件外面。勾选后能改它的 props */
const ProviderPanel = ({ manifest }: { manifest: Manifest }) => {
  const m = useMessages().props;
  const enabled = useEnabledProviders();
  if (manifest.providers.length === 0) return null;
  const count = manifest.providers.filter((p) => providerId(p) in enabled).length;
  return (
    <Panel title={m.providersTitle(count, manifest.providers.length)}>
      <p className="pp-mute">{m.providersHint}</p>
      {manifest.providers.map((provider) => {
        const on = providerId(provider) in enabled;
        return (
          <div className="pp-provider" key={providerId(provider)}>
            <label title={provider.file}>
              <input
                checked={on}
                onChange={(event) => toggleProvider(provider, event.target.checked)}
                type="checkbox"
              />
              {provider.name}
            </label>
            {on && (
              <PropRows
                onChange={(name, value) => setProviderProp(provider, name, value)}
                props={provider.props}
                values={enabled[providerId(provider)] ?? {}}
              />
            )}
          </div>
        );
      })}
    </Panel>
  );
};

export const ComponentPanels = ({
  manifest,
  component,
  propValues,
  onPropChange,
  onPropReset,
}: {
  manifest: Manifest;
  component: ComponentInfo;
  propValues: PropValues;
  onPropChange: PropChange;
  onPropReset: () => void;
}) => {
  const m = useMessages().props;
  const defined = new Map(manifest.tokens.map((token) => [token.name, token]));
  return (
    <>
      <Panel title={m.componentTitle}>
        <Row label={m.name}>{component.name}</Row>
        <Row label={m.file}>
          <code>{component.file}</code>
        </Row>
        <Row label={m.exportName}>
          <code>{component.exportName}</code>
        </Row>
        <Row label={m.status}>
          {component.unavailable ? m.unavailable : component.draft ? m.draftStatus : m.available}
        </Row>
      </Panel>
      <Panel title={m.propsTitle(component.props.length)}>
        {component.props.length === 0 && <p className="pp-mute">{m.noOwnProps}</p>}
        <PropRows
          onChange={component.unavailable ? undefined : onPropChange}
          props={component.props}
          values={propValues}
        />
        {!component.unavailable && component.props.length > 0 && (
          <button className="pp-button" onClick={onPropReset} type="button">
            {m.reset}
          </button>
        )}
      </Panel>
      {!component.unavailable && <ProviderPanel manifest={manifest} />}
      <Panel title={m.tokensTitle(component.tokens.length)}>
        {component.tokens.length === 0 && <p className="pp-mute">{m.noTokens}</p>}
        {component.tokens.map((name) => {
          const token = defined.get(name);
          return token ? (
            <TokenRow key={name} token={token} tokens={manifest.tokens} />
          ) : (
            <Row key={name} label={name.replace(/^--/, "")} title={name}>
              <span className="pp-mute">{m.tokenUndefined}</span>
            </Row>
          );
        })}
      </Panel>
    </>
  );
};

export const Properties = ({
  manifest,
  view,
  propValues,
  onPropChange,
  onPropReset,
}: {
  manifest: Manifest;
  view: { kind: "component"; component: ComponentInfo };
  propValues: PropValues;
  onPropChange: PropChange;
  onPropReset: () => void;
}) => (
  <ComponentPanels
    component={view.component}
    manifest={manifest}
    onPropChange={onPropChange}
    onPropReset={onPropReset}
    propValues={propValues}
  />
);
