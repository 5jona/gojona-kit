import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../lib/cn.ts';

const inputVariants = cva(
    'pochita-input min-w-0 w-full rounded-[var(--radius-control)] border border-[var(--border-hairline)] bg-[var(--surface-card)] text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] transition-colors duration-150 focus:border-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-45',
    {
        variants: {
            size: {
                sm: 'h-8 px-3 text-xs',
                md: 'h-9 px-3 text-xs',
            },
            mono: {
                true: 'font-mono',
                false: '',
            },
        },
        defaultVariants: {
            size: 'sm',
            mono: false,
        },
    },
);

export interface InputProps
    extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>,
    VariantProps<typeof inputVariants> { }

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
    { className, size, mono, type = 'text', ...props },
    ref,
) {
    return (
        <input
            ref={ref}
            type={type}
            className={cn(inputVariants({ size, mono }), className)}
            {...props}
        />
    );
});
