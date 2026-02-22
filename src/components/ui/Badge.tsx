import React from "react";

type BadgeProps = {
    children: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
};

export function Badge({children, className = "", style}: BadgeProps) {
    return (
        <div className={`badge ${className}`.trim()} style={style}>
            <span className="badge-dot"/> {children}
        </div>
    );
}

export default Badge;

