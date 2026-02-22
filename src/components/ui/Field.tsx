import React from "react";

type FieldProps = {
    label: string;
    children: React.ReactNode;
    className?: string;
    as?: "label" | "div";
};

type InlineProps = {
    children: React.ReactNode;
    className?: string;
};

export function Field({label, children, className = "", as = "label"}: FieldProps) {
    const Tag = as;
    return (
        <Tag className={`field ${className}`.trim()}>
            <span className="field-label">{label}</span>
            {children}
        </Tag>
    );
}

export function FieldInline({children, className = ""}: InlineProps) {
    return <div className={`field-inline ${className}`.trim()}>{children}</div>;
}

export function ControlGrid({children}: InlineProps) {
    return <div className="control-grid">{children}</div>;
}

export default Field;

