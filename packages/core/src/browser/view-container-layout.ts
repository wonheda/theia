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

    protected readonly defaultSizes = new Map<Widget, number>();
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

    protected prevHandlePosition(index: number): number {
        return index === 0 ? 0 : this.handles[index - 1].offsetTop;
    }

    protected handlePosition(index: number): number {
        return index === this.handles.length - 1
            ? this.parent!.node.offsetHeight
            : this.handles[index].offsetTop;
    }

    protected prevExpandedIndex(fromIndex: number): number {
        for (let i = fromIndex - 1; i >= 0; i--) {
            if (!this.isCollapsed(this.items[i].widget)) {
                return i;
            }
        }
        return -1;
    }

    protected nextExpandedIndex(fromIndex: number): number {
        const result = this.items.map(({ widget }) => widget).findIndex((widget, i) => i > fromIndex && !this.isCollapsed(widget));
        return result === -1 ? this.items.length - 1 : result;
    }

    protected onFitRequest(msg: Message): void {
        super.onFitRequest(msg);
        requestAnimationFrame(() => {
            const relativeSizes = this.relativeSizes();
            for (let i = 0; i < this.items.length; i++) {
                const { widget } = this.items[i];
                if (!this.defaultSizes.has(widget)) {
                    this.defaultSizes.set(widget, relativeSizes[i]);
                }
            }
        });
    }

    removeWidget(widget: Widget): void {
        this.defaultSizes.delete(widget);
        super.removeWidget(widget);
    }

    removeWidgetAt(index: number): void {
        // tslint:disable-next-line:no-any
        const widget = (this as any)._widgets[index];
        if (widget) {
            this.defaultSizes.delete(widget);
        }
        super.removeWidgetAt(index);
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

        if (!this.parent) {
            return;
        }

        // TODO: `ViewContainerPart.HEADER_HEIGHT` should not be here.
        const { widget } = this.items[index];
        if (this.isCollapsed(widget)) {
            const prevExpandedIndex = this.prevExpandedIndex(index);
            if (prevExpandedIndex !== -1) {
                const position = this.handlePosition(index) - this.handles[index].offsetHeight - ViewContainerPart.HEADER_HEIGHT;
                this.animateHandle(prevExpandedIndex, position);
            } else {
                // TODO: check if `offsetHeight` is needed here or not.
                // Collapse the 1. index.
                const nextExpandedIndex = this.nextExpandedIndex(index);
                const position = this.prevHandlePosition(index) + ((nextExpandedIndex - index) * ViewContainerPart.HEADER_HEIGHT);
                this.animateHandle(Math.max(nextExpandedIndex - 1, 0), position);
            }
        } else {
            const expandedItems = this.items.filter(item => !this.isCollapsed(item.widget));
            // Expanding one item is special, as it has to stretch the entire available space.
            // In this case we do not reuse any previously stored heights.
            if (expandedItems.length === 1) {
                const position = this.parent.node.clientHeight - ((this.items.length - 1 - index) * ViewContainerPart.HEADER_HEIGHT);
                this.animateHandle(index, position);
            } else {
                // Poor man's solution if nothing else works.
                // const relativeSizes = this.relativeSizes();
                // let toNormalize = 1;
                // for (let i = 0; i < this.items.length; i++) {
                //     if (this.isCollapsed(this.items[i].widget)) {
                //         toNormalize -= relativeSizes[i];
                //     }
                // }
                // const ratio = toNormalize / expandedItems.length;
                // const updatedRelativeSizes = relativeSizes.slice();
                // for (let i = 0; i < this.items.length; i++) {
                //     if (!this.isCollapsed(this.items[i].widget)) {
                //         updatedRelativeSizes[i] = ratio;
                //     }
                // }
                // this.setRelativeSizes(updatedRelativeSizes);

                // This is another alternative. Same as above, but animates the handle moves after normalizing the item sizes.
                const { items } = this;
                const itemCount = items.length;
                const { offsetHeight } = this.parent.node;
                // The hint is without the header height.
                const heightHint = (offsetHeight - (itemCount * ViewContainerPart.HEADER_HEIGHT)) / expandedItems.length;
                // TODO: Here we should consider weights.
                let prevHandlePosition = 0;
                const animations: [number, number][] = [];
                for (let i = 0; i < itemCount; i++) {
                    if (this.isCollapsed(items[i].widget)) {
                        prevHandlePosition += ViewContainerPart.HEADER_HEIGHT;
                    } else {
                        prevHandlePosition += (heightHint + ViewContainerPart.HEADER_HEIGHT);
                    }
                    animations.push([i, prevHandlePosition]);
                }
                for (const [handleIndex, position] of animations) {
                    this.animateHandle(handleIndex, position);
                }

            }
        }

    }

}

export namespace ViewContainerLayout {
    export interface Options extends SplitLayout.IOptions {
        isCollapsed?(widget: Widget): boolean;
    }
}
