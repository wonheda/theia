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
import { SplitLayout, Widget, LayoutItem } from './widgets';
import { ViewContainerPart } from './view-container';

export class ViewContainerLayout extends SplitLayout {

    constructor(protected options: ViewContainerLayout.Options) {
        super(options);
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

    animateHandle(index: number, position: number): void {
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
            }
        };
        next();
    }

    toggleCollapsed(index: number): void {
        // Cannot collapse with horizontal orientation.
        if (this.orientation === 'horizontal') {
            return;
        }

        const { widget } = this.items[index];
        if (this.isCollapsed(widget)) {
            const prevExpandedIndex = this.prevExpandedIndex(index);
            if (prevExpandedIndex !== -1) {
                const handlePosition = this.handlePosition(index);
                const position = handlePosition - this.handles[index].offsetHeight - ViewContainerPart.HEADER_HEIGHT;
                this.animateHandle(prevExpandedIndex, position);
            } else {
                const nextExpandedIndex = this.nextExpandedIndex(index);
                const position = this.prevHandlePosition(index) + ((nextExpandedIndex - index) * ViewContainerPart.HEADER_HEIGHT);
                this.animateHandle(nextExpandedIndex - 1, position);
            }
        }

    }

}

export namespace ViewContainerLayout {
    export interface Options extends SplitLayout.IOptions {
        isCollapsed?(widget: Widget): boolean;
    }
}
