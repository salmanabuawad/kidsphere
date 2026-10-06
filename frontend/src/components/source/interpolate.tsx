import { Fragment, type ReactNode } from "react";

/**
 * Fill `{placeholders}` of an already translated template with React nodes, so a
 * name or a date can sit in its own <bdi> (bidi isolation) inside an ar/he sentence.
 * Unknown placeholders stay as they are, like interpolate() in i18n/translate.
 */
export function interpolateNodes(template: string, vars: Record<string, ReactNode>): ReactNode[] {
  return template.split(/(\{\w+\})/g).map((part, i) => {
    const m = /^\{(\w+)\}$/.exec(part);
    if (m && m[1]! in vars) return <Fragment key={i}>{vars[m[1]!]}</Fragment>;
    return part ? <Fragment key={i}>{part}</Fragment> : null;
  });
}
