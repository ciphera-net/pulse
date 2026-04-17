'use client';
import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/button-website';
import { cn } from '@/lib/utils';
import { initiateOAuthFlow, initiateSignupFlow } from '@/lib/api/oauth';
import { MenuToggleIcon } from '@/components/ui/menu-toggle-icon';
import { createPortal } from 'react-dom';
import {
    NavigationMenu,
    NavigationMenuContent,
    NavigationMenuItem,
    NavigationMenuLink,
    NavigationMenuList,
    NavigationMenuTrigger,
} from '@/components/ui/navigation-menu';
import type { Icon } from '@phosphor-icons/react';
import {
    ChartBar,
    Eye,
    Funnel,
    PaperPlaneTilt,
    FileText,
    PuzzlePiece,
    Question,
} from '@phosphor-icons/react';

type LinkItem = {
    title: string;
    href: string;
    icon?: Icon;
    description?: string;
};

const featureLinks: LinkItem[] = [
    {
        title: 'Dashboard',
        href: '/features#dashboard',
        icon: ChartBar,
        description: 'Real-time traffic overview',
    },
    {
        title: 'Visitor Insights',
        href: '/features#visitors',
        icon: Eye,
        description: 'Browser, device & geo data',
    },
    {
        title: 'Conversion Funnels',
        href: '/features#funnels',
        icon: Funnel,
        description: 'Multi-step drop-off analysis',
    },
    {
        title: 'Email Reports',
        href: '/features#reports',
        icon: PaperPlaneTilt,
        description: 'Scheduled inbox summaries',
    },
];

const resourceLinks: LinkItem[] = [
    {
        title: 'Installation',
        href: '/installation',
        icon: FileText,
        description: 'Setup guides & code snippets',
    },
    {
        title: 'Integrations',
        href: '/integrations',
        icon: PuzzlePiece,
        description: '75+ framework guides',
    },
    {
        title: 'FAQ',
        href: '/faq',
        icon: Question,
        description: 'Common questions answered',
    },
];

export function Header() {
    const [open, setOpen] = React.useState(false);
    const scrolled = useScroll(10);

    React.useEffect(() => {
        if (open) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [open]);

    return (
        <header
            className={cn('sticky top-0 z-50 w-full border-b border-transparent', {
                'border-white/[0.06]': scrolled,
            })}
        >
            <div className={cn("absolute inset-0 -z-10 transition-opacity duration-base", scrolled ? "opacity-100 backdrop-blur-xl bg-neutral-950/60 supports-[backdrop-filter]:bg-neutral-950/50" : "opacity-0")} />
            <nav className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6 my-3">
                <div className="flex items-center gap-5">
                    <Link href="/" className="hover:bg-accent rounded-md p-2 flex items-center gap-2">
                        <Image
                            src="/pulse_icon_no_margins.png"
                            alt="Pulse"
                            width={36}
                            height={36}
                            priority
                            className="object-contain w-8 h-8"
                            unoptimized
                        />
                        <span className="text-xl font-bold text-foreground tracking-tight">
                            Pulse
                        </span>
                    </Link>
                    <NavigationMenu className="hidden md:flex">
                        <NavigationMenuList>
                            {/* Features dropdown */}
                            <NavigationMenuItem>
                                <NavigationMenuTrigger className="bg-transparent">Features</NavigationMenuTrigger>
                                <NavigationMenuContent className="bg-transparent p-1 pr-1.5">
                                    <ul className="grid w-[32rem] grid-cols-2 gap-2 rounded-md border border-white/[0.06] bg-white/[0.04] p-2">
                                        {featureLinks.map((item, i) => (
                                            <li key={i}>
                                                <ListItem title={item.title} href={item.href} icon={item.icon} description={item.description} />
                                            </li>
                                        ))}
                                    </ul>
                                </NavigationMenuContent>
                            </NavigationMenuItem>

                            {/* Resources dropdown */}
                            <NavigationMenuItem>
                                <NavigationMenuTrigger className="bg-transparent">Resources</NavigationMenuTrigger>
                                <NavigationMenuContent className="bg-transparent p-1 pr-1.5 pb-1.5">
                                    <div className="grid w-[32rem] grid-cols-2 gap-2">
                                        <ul className="space-y-2 rounded-md border border-white/[0.06] bg-white/[0.04] p-2">
                                            {resourceLinks.map((item, i) => (
                                                <li key={i}>
                                                    <ListItem {...item} />
                                                </li>
                                            ))}
                                        </ul>
                                        <div className="flex flex-col justify-center gap-3 p-4">
                                            <p className="text-sm font-medium text-foreground">Need help?</p>
                                            <p className="text-xs text-muted-foreground leading-relaxed">
                                                Questions about setup, integrations, or billing — we typically respond within 24-48 hours.
                                            </p>
                                            <a href="mailto:support@ciphera.net" className="text-sm font-medium text-brand-orange hover:underline">
                                                support@ciphera.net &rarr;
                                            </a>
                                        </div>
                                    </div>
                                </NavigationMenuContent>
                            </NavigationMenuItem>

                            {/* Pricing standalone link */}
                            <NavigationMenuItem>
                                <NavigationMenuLink asChild>
                                    <Link href="/pricing" className="group inline-flex h-9 w-max items-center justify-center rounded-md bg-transparent px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none">
                                        Pricing
                                    </Link>
                                </NavigationMenuLink>
                            </NavigationMenuItem>
                        </NavigationMenuList>
                    </NavigationMenu>
                </div>
                <div className="hidden items-center gap-2 md:flex">
                    <Button variant="outline" onClick={() => initiateOAuthFlow()}>Sign In</Button>
                    <Button onClick={() => initiateSignupFlow()}>Get Started</Button>
                </div>
                <div className="flex items-center gap-2 md:hidden">
                    <Button
                        size="icon"
                        variant="outline"
                        onClick={() => setOpen(!open)}
                        aria-expanded={open}
                        aria-controls="mobile-menu"
                        aria-label="Toggle menu"
                    >
                        <MenuToggleIcon open={open} className="size-5" duration={300} />
                    </Button>
                </div>
            </nav>
            <MobileMenu open={open} className="flex flex-col justify-between gap-2 overflow-y-auto">
                <NavigationMenu className="max-w-full">
                    <div className="flex w-full flex-col gap-y-2">
                        <span className="text-sm">Features</span>
                        {featureLinks.map((link) => (
                            <ListItem key={link.title} title={link.title} href={link.href} icon={link.icon} description={link.description} />
                        ))}
                        <span className="text-sm">Resources</span>
                        {resourceLinks.map((link) => (
                            <ListItem key={link.title} {...link} />
                        ))}
                        <Link
                            href="/pricing"
                            className="flex flex-row gap-x-2 rounded-sm p-2 transition-colors hover:bg-white/[0.06]"
                        >
                            <div className="flex aspect-square size-12 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.05] shadow-sm p-2">
                                <ChartBar className="text-foreground size-5" />
                            </div>
                            <div className="flex flex-col items-start justify-center">
                                <span className="text-sm font-medium">Pricing</span>
                                <span className="text-muted-foreground text-xs">Plans & billing</span>
                            </div>
                        </Link>
                    </div>
                </NavigationMenu>
                <div className="flex flex-col gap-2">
                    <Button variant="outline" className="w-full bg-transparent" onClick={() => initiateOAuthFlow()}>Sign In</Button>
                    <Button className="w-full" onClick={() => initiateSignupFlow()}>Get Started</Button>
                </div>
            </MobileMenu>
        </header>
    );
}

type MobileMenuProps = React.ComponentProps<'div'> & {
    open: boolean;
};

function MobileMenu({ open, children, className, ...props }: MobileMenuProps) {
    if (!open || typeof window === 'undefined') return null;

    return createPortal(
        <div
            id="mobile-menu"
            className={cn(
                'bg-background/95 supports-[backdrop-filter]:bg-background/50 backdrop-blur-lg',
                'fixed top-16 right-0 bottom-0 left-0 z-40 flex flex-col overflow-hidden border-y md:hidden',
            )}
        >
            <div
                data-slot={open ? 'open' : 'closed'}
                className={cn(
                    'data-[slot=open]:animate-in data-[slot=open]:zoom-in-95 ease-apple',
                    'size-full p-4',
                    className,
                )}
                {...props}
            >
                {children}
            </div>
        </div>,
        document.body,
    );
}

function ListItem({
    title,
    description,
    icon: Icon,
    className,
    href,
    ...props
}: React.ComponentProps<typeof NavigationMenuLink> & LinkItem) {
    return (
        <NavigationMenuLink className={cn('w-full flex flex-row gap-x-2 data-[active=true]:focus:bg-white/[0.06] data-[active=true]:hover:bg-white/[0.06] data-[active=true]:text-accent-foreground hover:bg-white/[0.06] hover:text-accent-foreground focus:bg-white/[0.06] focus:text-accent-foreground rounded-sm p-2 transition-colors', className)} {...props} asChild>
            <Link href={href || '#'}>
                <div className="flex aspect-square size-12 items-center justify-center rounded-md border border-white/[0.08] bg-white/[0.05] shadow-sm p-2">
                    {Icon ? (
                        <Icon className="text-foreground size-5" />
                    ) : null}
                </div>
                <div className="flex flex-col items-start justify-center">
                    <span className="text-sm font-medium">{title}</span>
                    <span className="text-muted-foreground text-xs">{description}</span>
                </div>
            </Link>
        </NavigationMenuLink>
    );
}

function useScroll(threshold: number) {
    const [scrolled, setScrolled] = React.useState(false);

    const onScroll = React.useCallback(() => {
        setScrolled(window.scrollY > threshold);
    }, [threshold]);

    React.useEffect(() => {
        window.addEventListener('scroll', onScroll);
        return () => window.removeEventListener('scroll', onScroll);
    }, [onScroll]);

    React.useEffect(() => {
        onScroll();
    }, [onScroll]);

    return scrolled;
}
