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

import { ElementExt } from '@phosphor/domutils';
import { MessageLoop } from '@phosphor/messaging';
import { BoxSizer } from '@phosphor/widgets';
import { IIterator, iter, toArray } from '@phosphor/algorithm';
import { SplitLayout, Widget, LayoutItem } from '../widgets';

export class TheiaSplitLayout extends SplitLayout {

    protected beforeCollapseSizes = new Map<Widget, BoxSizer>();

    constructor(options: SplitLayout.IOptions) {
        super(options);
        // Copied and adjusted. Based on: https://github.com/phosphorjs/phosphor/blob/f16d13f11b433089cccca82edc2e16007be581aa/packages/widgets/src/splitlayout.ts#L441-L530
        this['_fit'] = () => {
            // Update the handles and track the visible widget count.
            let nVisible = 0;
            let lastHandleIndex = -1;
            // tslint:disable-next-line:no-any
            const _this = this as any;
            for (let i = 0, n = _this.items.length; i < n; ++i) { // tslint:disable-line:one-variable-per-declaration
                if (_this._items[i].isHidden) {
                    _this._handles[i].classList.add('p-mod-hidden');
                } else {
                    _this._handles[i].classList.remove('p-mod-hidden');
                    lastHandleIndex = i;
                    nVisible++;
                }
            }

            // Hide the handle for the last visible widget.
            if (lastHandleIndex !== -1) {
                _this._handles[lastHandleIndex].classList.add('p-mod-hidden');
            }

            // Update the fixed space for the visible items.
            _this._fixed = _this._spacing * Math.max(0, nVisible - 1);

            // Setup the computed minimum size.
            const horz = _this._orientation === 'horizontal';
            let minW = horz ? _this._fixed : 0;
            let minH = horz ? 0 : _this._fixed;

            // Update the sizers and computed size limits.
            for (let i = 0, n = _this._items.length; i < n; ++i) { // tslint:disable-line:one-variable-per-declaration
                // Fetch the item and corresponding box sizer.
                const item = _this._items[i];
                const sizer = _this._sizers[i];

                // Prevent resizing unless necessary.
                if (sizer.size > 0) {
                    sizer.sizeHint = sizer.size;
                }

                // If the item is hidden, it should consume zero size.
                if (item.isHidden) {
                    sizer.minSize = 0;
                    sizer.maxSize = 0;
                    continue;
                }

                // START: Theia customization.
                if (item.widget.collapsed === true) {
                    const copy = this.clone(sizer);
                    // We store the previous state, so that we can guess when re-expanding the layout item.
                    if (copy && item.widget instanceof Widget && !this.beforeCollapseSizes.has(item.widget)) {
                        this.beforeCollapseSizes.set(item.widget, copy);
                    }
                    sizer.minSize = 22;
                    sizer.maxSize = 22;
                    continue;
                }
                // END: Theia customization.

                // Update the size limits for the item.
                item.fit();

                // Update the stretch factor.
                sizer.stretch = SplitLayout.getStretch(item.widget);

                // Update the sizer limits and computed min size.
                if (horz) {
                    sizer.minSize = item.minWidth;
                    sizer.maxSize = item.maxWidth;
                    minW += item.minWidth;
                    minH = Math.max(minH, item.minHeight);
                } else {
                    sizer.minSize = item.minHeight;
                    sizer.maxSize = item.maxHeight;
                    minH += item.minHeight;
                    minW = Math.max(minW, item.minWidth);
                }
            }

            // Update the box sizing and add it to the computed min size.
            const box = _this._box = ElementExt.boxSizing(this.parent!.node);
            minW += box.horizontalSum;
            minH += box.verticalSum;

            // Update the parent's min size constraints.
            const style = this.parent!.node.style;
            style.minWidth = `${minW}px`;
            style.minHeight = `${minH}px`;

            // Set the dirty flag to ensure only a single update occurs.
            _this._dirty = true;

            // Notify the ancestor that it should fit immediately. This may
            // cause a resize of the parent, fulfilling the required update.
            if (this.parent!.parent) {
                MessageLoop.sendMessage(this.parent!.parent!, Widget.Msg.FitRequest);
            }

            // If the dirty flag is still set, the parent was not resized.
            // Trigger the required update on the parent widget immediately.
            if (_this._dirty) {
                MessageLoop.sendMessage(this.parent!, Widget.Msg.UpdateRequest);
            }
        };
    }

    /**
     * Overridden to provide the wrapped widgets in the expected order.
     */
    iter(): IIterator<Widget> {
        const widgets = this.items.map(item => item.widget);
        return iter(widgets);
    }

    /**
     * Overridden to return with the correct order after reordering the underlying layout items.
     */
    get widgets(): ReadonlyArray<Widget> {
        return toArray(this.iter());
    }

    /**
     * Finds the layout item based on the wrapped widget.
     */
    findLayoutItem(widget: Widget): LayoutItem | undefined {
        return this.items.find(item => item.widget === widget);
    }

    // Exposed as `public`.
    fit(widget: Widget, collapsed: boolean): void {
        // Reuse the previous `sizer` state if any. Otherwise, guess a new `sizer`.
        if (!collapsed) {
            const index = this.widgets.indexOf(widget);
            if (index !== -1) {
                // tslint:disable-next-line:no-any
                const sizer = (this as any)._sizers[index];
                if (sizer instanceof BoxSizer) {
                    const previousSizer = this.beforeCollapseSizes.get(widget);
                    if (previousSizer) {
                        this.beforeCollapseSizes.delete(widget);
                        // tslint:disable-next-line:no-any
                        (this as any)._sizers[index] = previousSizer;
                    } else {
                        // GUESS
                    }
                }
            }
        }
        // tslint:disable-next-line:no-any
        (this as any)._fit();
    }

    removeWidget(widget: Widget): void {
        this.beforeCollapseSizes.delete(widget);
        super.removeWidget(widget);
    }

    removeWidgetAt(index: number): void {
        const item = this.items[index];
        if (item) {
            this.beforeCollapseSizes.delete(item.widget);
        }
        super.removeWidgetAt(index);
    }

    // Exposed as `public`.
    moveWidget(fromIndex: number, toIndex: number): void {
        // Note: internally, the `widget` argument is not used. See: `node_modules/@phosphor/widgets/lib/splitlayout.js`.
        // tslint:disable-next-line:no-any
        super.moveWidget(fromIndex, toIndex, undefined as any);
    }

    protected get items(): ReadonlyArray<LayoutItem> {
        // tslint:disable-next-line:no-any
        return (this as any)._items as Array<LayoutItem>;
    }

    // tslint:disable-next-line:no-any
    protected clone(sizer: any): BoxSizer | undefined {
        if (sizer instanceof BoxSizer) {
            const copy = new BoxSizer();
            Object.assign(copy, sizer);
            return copy;
        }
        return undefined;
    }

}
