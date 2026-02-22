import React from "react";

type ButtonRowProps = {
    children: React.ReactNode;
    className?: string;
};

export function ButtonRow({children, className = ""}: ButtonRowProps) {
    return <div className={`button-row ${className}`.trim()}>{children}</div>;
}

export default ButtonRow;

