/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { IIterator, iter, toArray } from '@phosphor/algorithm';
import { Message } from '@phosphor/messaging';
import { SplitLayout, Widget, LayoutItem } from './widgets';
import { ViewContainerPart } from './view-container';
import * as PQueue from 'p-queue';

export class ViewContainerLayout extends SplitLayout {

    protected readonly defaultHeights = new Map<Widget, number>();
    protected readonly beforeCollapseHeights = new Map<Widget, number>();
    protected readonly animationQueue = new PQueue({ autoStart: true, concurrency: 1 });

    constructor(protected options: ViewContainerLayout.Options) {
        super(Object.assign(options, { fitPolicy: 'set-no-constraint' }));
    }

    iter(): IIterator<Widget> {
        const widgets = this.items.map(item => item.widget);
        return iter(widgets);
    }

    get widgets(): ReadonlyArray<Widget> {
        return toArray(this.iter());
    }

    moveWidget(fromIndex: number, toIndex: number): void {
        // Note: internally, the `widget` argument is not used. See: `node_modules/@phosphor/widgets/lib/splitlayout.js`.
        // tslint:disable-next-line:no-any
        super.moveWidget(fromIndex, toIndex, undefined as any);
    }

    protected get items(): ReadonlyArray<LayoutItem> {
        // tslint:disable-next-line:no-any
        return (this as any)._items as Array<LayoutItem>;
    }

    protected isCollapsed(widget: Widget): boolean {
        if (this.options.isCollapsed) {
            return this.options.isCollapsed(widget);
        }
        if (widget instanceof ViewContainerPart) {
            return widget.collapsed;
        }
        return false;
    }

    protected minHeight(widget: Widget): number {
        if (this.options.minHeight) {
            return this.options.minHeight(widget);
        }
        if (widget instanceof ViewContainerPart) {
            return widget.minHeight;
        }
        return 100;
    }

    /**
     * The last handle is always hidden, we cannot get the `offsetTop` of the `HTMLDivElement`.
     * Instead, we get the `offsetHeight` of the parent `node`.
     */
    protected handlePosition(index: number): number {
        return index === this.handles.length - 1
            ? this.parent!.node.offsetHeight
            : this.handles[index].offsetTop;
    }

    protected onFitRequest(msg: Message): void {
        super.onFitRequest(msg);
        requestAnimationFrame(() => {
            for (let i = 0; i < this.items.length; i++) {
                const { widget } = this.items[i];
                const { offsetHeight } = widget.node;
                if (!this.defaultHeights.has(widget)) {
                    this.defaultHeights.set(widget, offsetHeight);
                }
            }
        });
    }

    removeWidget(widget: Widget): void {
        this.defaultHeights.delete(widget);
        super.removeWidget(widget);
    }

    removeWidgetAt(index: number): void {
        // tslint:disable-next-line:no-any
        const widget = (this as any)._widgets[index];
        if (widget) {
            this.defaultHeights.delete(widget);
            this.beforeCollapseHeights.delete(widget);
        }
        super.removeWidgetAt(index);
    }

    dispose(): void {
        if (!this.animationQueue.isPaused) {
            this.animationQueue.pause();
        }
        this.animationQueue.clear();
        super.dispose();
    }

    async animateHandle(index: number, position: number): Promise<void> {
        this.animationQueue.add(() => new Promise<void>(animationResolve => {
            const start = this.handlePosition(index);
            const end = position;
            const done = (f: number, t: number) => start < end ? f >= t : t >= f;
            const step = () => start < end ? 40 : -40;
            const moveHandle = (p: number) => new Promise<void>(resolve => {
                if (start < end) {
                    if (p > end) {
                        this.moveHandle(index, end);
                    } else {
                        this.moveHandle(index, p);
                    }
                } else {
                    if (p < end) {
                        this.moveHandle(index, end);
                    } else {
                        this.moveHandle(index, p);
                    }
                }
                resolve();
            });
            let currentPosition = start;
            const next = () => {
                if (!done(currentPosition, end)) {
                    moveHandle(currentPosition += step()).then(() => {
                        window.requestAnimationFrame(next);
                    });
                } else {
                    if (start < end) {
                        if (currentPosition < end) {
                            throw new Error(`currentPosition < end; currentPosition: ${currentPosition}, end: ${end} start: ${start}.`);
                        }
                    } else {
                        if (currentPosition > end) {
                            throw new Error(`currentPosition > end; currentPosition: ${currentPosition}, end: ${end} start: ${start}.`);
                        }
                    }
                    animationResolve();
                }
            };
            next();
        }));
    }

    toggleCollapsed(index: number): void {
        // Cannot collapse with horizontal orientation.
        if (this.orientation === 'horizontal') {
            return;
        }

        const { widget } = this.items[index];
        if (this.isCollapsed(widget)) {
            this.beforeCollapseHeights.set(widget, widget.node.offsetHeight);
        }

        const adjuster = this.createAdjuster();
        const animations = adjuster.adjustHandlers(index);
        for (const { handleIndex, position } of animations) {
            this.animateHandle(handleIndex, position);
        }

    }

    private createAdjuster(): ViewContainerLayout.HandleAdjuster {
        if (!this.parent) {
            return new ViewContainerLayout.NoopHandleAdjuster();
        }
        const fullHeight = this.parent.node.offsetHeight;
        const items = this.handles.map((_, i) => ({
            defaultHeight: this.defaultHeights.get(this.items[i].widget) || -1,
            beforeCollapseHeight: this.beforeCollapseHeights.get(this.items[i].widget),
            minHeight: this.minHeight(this.items[i].widget),
            position: this.handlePosition(i),
            collapsed: this.isCollapsed(this.items[i].widget)
        }));
        return new ViewContainerLayout.HandleAdjuster(fullHeight, items);
    }

}

export namespace ViewContainerLayout {

    export interface Options extends SplitLayout.IOptions {
        isCollapsed?(widget: Widget): boolean;
        minHeight?(widget: Widget): number;
    }

    export class HandleAdjuster {

        constructor(
            readonly fullHeight: number,
            readonly items: ReadonlyArray<Readonly<{
                defaultHeight: number,
                beforeCollapseHeight?: number,
                minHeight: number,
                position: number,
                collapsed: boolean
            }>>
        ) {

        }

        adjustHandlers(index: number): ReadonlyArray<Readonly<{ handleIndex: number, position: number }>> {
            if (this.items[index].collapsed) {
                const prevExpandedIndex = this.prevExpanded(index);
                if (prevExpandedIndex !== -1) {
                    const position = this.items[index].position - 2 - this.headerHeight;
                    return [{ handleIndex: prevExpandedIndex, position }];
                } else {
                    // TODO: check if `offsetHeight` is needed here or not.
                    // Collapse the 1. index.
                    const nextExpandedIndex = this.nextExpanded(index);
                    const position = (index === 0 ? 0 : this.items[index - 1].position) + ((nextExpandedIndex - index) * this.headerHeight);
                    return [{ handleIndex: Math.max(nextExpandedIndex - 1, 0), position }];
                }
            } else {
                const animations: Array<{ handleIndex: number, position: number }> = [];
                const expandedItems = this.items.filter(item => !item.collapsed);
                if (expandedItems.length === 1) {
                    const position = this.fullHeight - ((this.items.length - 1 - index) * this.headerHeight);
                    animations.push({ handleIndex: index, position });
                } else {
                    let heightHint = this.items[index].beforeCollapseHeight;
                    if (heightHint === undefined || heightHint <= this.headerHeight) {
                        heightHint = this.items[index].defaultHeight;
                    }
                    if (heightHint < this.items[index].minHeight) {
                        heightHint = this.items[index].minHeight;
                    }
                    // Can we use the space above?
                    // We can if there is a previous open part which can shrink.
                    // TODO: check previous' current and minSize too.
                    const prevExpandedIndex = this.prevExpanded(index);
                    if (prevExpandedIndex !== -1) {
                        animations.push({
                            handleIndex: index - 1,
                            position: this.items[index].position - heightHint
                        });
                    } else {
                        animations.push({
                            handleIndex: index,
                            position: this.items[index].position + heightHint - this.headerHeight
                        });
                    }

                    const { handleIndex } = animations[0];
                    if (prevExpandedIndex !== -1) {
                        for (let i = handleIndex; i >= 0; i--) {
                            if (!this.items[i].collapsed) {
                                const prevHandlePosition = i === 0 ? -1 : this.items[i].position;
                                if (prevHandlePosition === -1) {
                                    break; // No more place above.
                                }
                                const newHeight = animations[animations.length - 1].position - prevHandlePosition;
                                if (newHeight < this.items[i].minHeight) {
                                    animations.push({
                                        handleIndex: i - 1,
                                        position: animations[animations.length - 1].position - (this.items[i].minHeight + this.headerHeight)
                                    });
                                } else {
                                    // If the previous was OK, we no need to adjust above.
                                    break;
                                }
                            }
                        }
                    }
                }
                return animations;
            }
        }

        protected get headerHeight(): number {
            return ViewContainerPart.HEADER_HEIGHT;
        }

        protected prevExpanded(from: number): number {
            for (let i = from - 1; i >= 0; i--) {
                if (!this.items[i].collapsed) {
                    return i;
                }
            }
            return -1;
        }

        protected nextExpanded(from: number): number {
            for (let i = from + 1; i < this.items.length; i++) {
                if (!this.items[i].collapsed) {
                    return i;
                }
            }
            return this.items.length - 1; // TODO: for consistency, -1 would be better.
        }

    }

    export class NoopHandleAdjuster extends HandleAdjuster {

        constructor() {
            super(0, []);
        }

        toggleCollapsed() {
            return [];
        }

    }

}
