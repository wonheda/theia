/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { interfaces } from 'inversify';
import { v4 } from 'uuid';
import { Widget, EXPANSION_TOGGLE_CLASS, COLLAPSED_CLASS, MessageLoop, Message, SplitPanel, BaseWidget, addEventListener, SplitLayout } from './widgets';
import { Event, Emitter } from '../common/event';
import { Disposable, DisposableCollection } from '../common/disposable';
import { MaybePromise } from '../common/types';
import { CommandRegistry } from '../common/command';
import { MenuModelRegistry, MenuPath } from '../common/menu';
import { ContextMenuRenderer, Anchor } from './context-menu-renderer';
import { ApplicationShell } from './shell/application-shell';

// const backgroundColor = () => '#' + (0x1000000 + (Math.random()) * 0xffffff).toString(16).substr(1, 6);

export class ViewContainer extends BaseWidget implements ApplicationShell.TrackableWidgetProvider {

    protected readonly panel: SplitPanel;

    constructor(protected readonly services: ViewContainer.Services, ...props: ViewContainer.Prop[]) {
        super();
        this.id = `view-container-widget-${v4()}`;
        this.addClass('theia-view-container');
        const layout = new SplitLayout({ renderer: SplitPanel.defaultRenderer, spacing: 2, orientation: 'vertical' });
        this.panel = new SplitPanel({ layout });
        this.panel.addClass('split-panel');
        for (const { widget } of props) {
            this.addWidget(widget);
        }

        const { commandRegistry, menuRegistry } = this.services;
        commandRegistry.registerCommand({ id: this.globalHideCommandId }, {
            execute: (anchor: Anchor) => {
                const { x, y } = anchor;
                const element = document.elementFromPoint(x, y);
                if (element instanceof Element) {
                    const closestPart = ViewContainerPart.closestPart(element);
                    if (closestPart && closestPart.id) {
                        const toHide = this.parts.find(part => part.id === closestPart.id);
                        if (toHide) {
                            this.toggleVisibility(toHide);
                        }
                    }
                }
            },
            isVisible: () => this.parts.some(part => !part.isHidden)
        });
        menuRegistry.registerMenuAction([...this.contextMenuPath, '0_global'], {
            commandId: this.globalHideCommandId,
            label: 'Hide'
        });
        this.toDispose.pushAll([
            Disposable.create(() => commandRegistry.unregisterCommand(this.globalHideCommandId)),
            Disposable.create(() => menuRegistry.unregisterMenuAction(this.globalHideCommandId))
        ]);
    }

    addWidget(widget: Widget, options?: ViewContainer.Factory.WidgetOptions): Disposable {
        const widgets = this.parts.map(part => part.wrapped);
        if (widgets.indexOf(widget) !== -1) {
            return Disposable.NULL;
        }
        const newPart = this.createPart(widget);
        this.registerPart(newPart);
        this.panel.addWidget(newPart);
        // this.update();
        return new DisposableCollection(
            Disposable.create(() => this.removeWidget(widget)),
            newPart.onCollapsed(collapsed => this.toggleCollapsed(newPart, collapsed)),
            newPart.onMoveBefore(moveBeforeThisId => this.moveBefore(newPart.id, moveBeforeThisId)),
            newPart.onContextMenu(mouseEvent => {
                if (mouseEvent.button === 2) {
                    mouseEvent.preventDefault();
                    mouseEvent.stopPropagation();
                    const { contextMenuRenderer } = this.services;
                    const { x, y } = mouseEvent;
                    contextMenuRenderer.render(this.contextMenuPath, { x, y });
                }
            })
        );
    }

    removeWidget(widget: Widget): boolean {
        const part = this.parts.find(({ wrapped }) => wrapped.id === widget.id);
        if (!part) {
            return false;
        }
        this.unregisterPart(part);
        // TODO: remove `part` from the `this.panel`.
        // this.update();
        return true;
    }

    getTrackableWidgets(): MaybePromise<Widget[]> {
        return this.parts;
    }

    protected createPart(widget: Widget): ViewContainerPart {
        return new ViewContainerPart(
            widget,
            this.id,
            {
                collapsed: false,
                hidden: false
            });
    }

    protected registerPart(toRegister: ViewContainerPart): void {
        const { commandRegistry, menuRegistry } = this.services;
        const commandId = this.toggleVisibilityCommandId(toRegister);
        commandRegistry.registerCommand({ id: commandId }, {
            execute: () => {
                const toHide = this.parts.find(part => part.id === toRegister.id);
                if (toHide) {
                    this.toggleVisibility(toHide);
                }
            },
            isToggled: () => {
                const widgetToToggle = this.parts.find(part => part.id === toRegister.id);
                if (widgetToToggle) {
                    return !widgetToToggle.isHidden;
                }
                return false;
            }
        });
        menuRegistry.registerMenuAction([...this.contextMenuPath, '1_widgets'], {
            commandId: commandId,
            label: toRegister.wrapped.title.label
        });
    }

    protected unregisterPart(part: ViewContainerPart): void {
        const { commandRegistry, menuRegistry } = this.services;
        const commandId = this.toggleVisibilityCommandId(part);
        commandRegistry.unregisterCommand(commandId);
        menuRegistry.unregisterMenuAction(commandId);
    }

    protected toggleVisibility(part: ViewContainerPart): void {
        console.log('toggleVisibility', part.isHidden, part.id);
    }

    protected toggleCollapsed(part: ViewContainerPart, collapsed: boolean): void {
        // TODO: do we need `collapsed`?
        console.log('toggleCollapsed', collapsed, part.id);
    }

    protected moveBefore(toMovedId: string, moveBeforeThisId: string): void {
        console.log('moveBefore', toMovedId, moveBeforeThisId);
    }

    protected onResize(msg: Widget.ResizeMessage): void {
        for (const widget of [this.panel, ...this.parts]) {
            MessageLoop.sendMessage(widget, Widget.ResizeMessage.UnknownSize);
        }
        super.onResize(msg);
    }

    protected onUpdateRequest(msg: Message): void {
        for (const widget of [this.panel, ...this.parts]) {
            widget.update();
        }
        super.onUpdateRequest(msg);
    }

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.panel.activate();
    }

    protected onAfterAttach(msg: Message): void {
        if (this.panel.isAttached) {
            Widget.detach(this.panel);
        }
        Widget.attach(this.panel, this.node);
        super.onAfterAttach(msg);
    }

    /**
     * Sugar for `this.panel.children()`. Returns with the parts, **not** the `wrapped`, original widgets.
     */
    protected get parts(): ViewContainerPart[] {
        const parts: ViewContainerPart[] = [];
        const itr = this.panel.children();
        let next = itr.next();
        while (next) {
            if (next instanceof ViewContainerPart) {
                parts.push(next);
                next = itr.next();
            } else {
                throw new Error(`Expected an instance of ${ViewContainerPart.prototype}. Got ${JSON.stringify(next)}`);
            }
        }
        return parts;
    }

    protected get contextMenuPath(): MenuPath {
        return [`${this.id}-context-menu`];
    }

    protected toggleVisibilityCommandId(part: ViewContainerPart): string {
        return `${this.id}:toggle-visibility-${part.id}`;
    }

    protected get globalHideCommandId(): string {
        return `${this.id}:toggle-visibility`;
    }

}

export namespace ViewContainer {

    export interface Prop {
        readonly widget: Widget;
        readonly options?: ViewContainer.Factory.WidgetOptions;
    }

    export interface Services {
        readonly contextMenuRenderer: ContextMenuRenderer;
        readonly commandRegistry: CommandRegistry;
        readonly menuRegistry: MenuModelRegistry;
    }

    export const Factory = Symbol('ViewContainerFactory');
    export interface Factory {
        (...widgets: Factory.WidgetDescriptor[]): ViewContainer;
    }
    export namespace Factory {
        export interface WidgetOptions {

            /**
             * https://code.visualstudio.com/docs/getstarted/keybindings#_when-clause-contexts
             */
            readonly when?: string;

            readonly order?: number;

            readonly weight?: number;

            readonly collapsed?: boolean;

            readonly canToggleVisibility?: boolean;

            // Applies only to newly created views
            readonly hideByDefault?: boolean;

            readonly workspace?: boolean;

            readonly focusCommand?: { id: string, keybindings?: string };
        }
        export interface WidgetDescriptor {

            // tslint:disable-next-line:no-any
            readonly widget: Widget | interfaces.ServiceIdentifier<Widget>;

            readonly options?: WidgetOptions;
        }
    }
}

export class ViewContainerPart extends BaseWidget {

    protected readonly header: HTMLElement;
    protected readonly body: HTMLElement;
    protected readonly collapsedEmitter = new Emitter<boolean>();
    protected readonly moveBeforeEmitter = new Emitter<string>();
    protected readonly contextMenuEmitter = new Emitter<MouseEvent>();

    protected collapsed: boolean;
    protected hidden: boolean;
    // This is a workaround for not being able to sniff into the `event.dataTransfer.getData` value when `dragover` due to security reasons.
    protected canBeDropTarget: boolean = true;

    constructor(
        public readonly wrapped: Widget,
        protected readonly viewContainerId: string,
        { collapsed, hidden }: { collapsed: boolean, hidden: boolean } = { collapsed: false, hidden: false }) {

        super();
        this.id = `${this.viewContainerId}--${wrapped.id}`;
        this.addClass('part');
        this.collapsed = collapsed;
        this.hidden = hidden;
        const { header, body, disposable } = this.createContent();
        this.header = header;
        this.body = body;
        this.toDispose.pushAll([
            disposable,
            this.collapsedEmitter,
            this.moveBeforeEmitter,
            this.contextMenuEmitter,
            this.registerDND(),
            this.registerContextMenu()
        ]);
        this.scrollOptions = {
            suppressScrollX: true,
            minScrollbarLength: 35
        };
        this.node.tabIndex = 0;
        this.setHidden(this.hidden);
    }

    get onCollapsed(): Event<boolean> {
        return this.collapsedEmitter.event;
    }

    get onMoveBefore(): Event<string> {
        return this.moveBeforeEmitter.event;
    }

    get onContextMenu(): Event<MouseEvent> {
        return this.contextMenuEmitter.event;
    }

    protected getScrollContainer(): HTMLElement {
        return this.body;
    }

    protected registerContextMenu(): Disposable {
        return new DisposableCollection(
            addEventListener(this.header, 'contextmenu', event => {
                this.contextMenuEmitter.fire(event);
            }),
            addEventListener(this.body, 'contextmenu', event => {
                // Just disabled the native menu.
                if (event.button === 2) {
                    // TODO: do now show the native context menu if the `body` is empty.
                    // const { x, y } = event;
                    // const element = document.elementFromPoint(x, y);
                    // event.stopPropagation();
                    // event.preventDefault();
                }
            })
        );
    }

    protected registerDND(): Disposable {
        this.header.draggable = true;
        const style = (event: DragEvent) => {
            event.preventDefault();
            const part = ViewContainerPart.closestPart(event.target);
            if (part instanceof HTMLElement) {
                if (this.canBeDropTarget) {
                    part.classList.add('drop-target');
                }
            }
        };
        const unstyle = (event: DragEvent) => {
            event.preventDefault();
            const part = ViewContainerPart.closestPart(event.target);
            if (part instanceof HTMLElement) {
                part.classList.remove('drop-target');
            }
        };
        return new DisposableCollection(
            addEventListener(this.header, 'dragstart', event => {
                const { dataTransfer } = event;
                if (dataTransfer) {
                    this.canBeDropTarget = false;
                    dataTransfer.effectAllowed = 'move';
                    dataTransfer.setData('view-container-dnd', this.id);
                    const dragImage = document.createElement('div');
                    dragImage.classList.add('theia-drag-image');
                    dragImage.innerText = this.wrapped.title.label;
                    document.body.appendChild(dragImage);
                    dataTransfer.setDragImage(dragImage, -10, -10);
                    setTimeout(() => document.body.removeChild(dragImage), 0);
                }
            }, false),
            addEventListener(this.node, 'dragend', () => this.canBeDropTarget = true, false),
            addEventListener(this.node, 'dragover', style, false),
            addEventListener(this.node, 'dragleave', unstyle, false),
            addEventListener(this.node, 'drop', event => {
                const { dataTransfer } = event;
                if (dataTransfer) {
                    const moveId = dataTransfer.getData('view-container-dnd');
                    if (moveId && moveId !== this.wrapped.id) {
                        this.moveBeforeEmitter.fire(moveId);
                    }
                    unstyle(event);
                }
            }, false)
        );
    }

    protected createContent(): { header: HTMLElement, body: HTMLElement, disposable: Disposable } {
        const disposable = new DisposableCollection();
        const { header, disposable: headerDisposable } = this.createHeader();
        const body = document.createElement('div');
        body.classList.add('body');
        this.node.appendChild(header);
        this.node.appendChild(body);
        disposable.push(headerDisposable);
        return {
            header,
            body,
            disposable,
        };
    }

    protected createHeader(): { header: HTMLElement, disposable: Disposable } {
        const disposable = new DisposableCollection();
        const header = document.createElement('div');
        header.classList.add('theia-header', 'header');
        disposable.push(addEventListener(header, 'click', () => {
            this.collapsed = !this.collapsed;
            // TODO: do we really need this? Cannot we hide the `widget`? Can we pass in container instead?
            this.collapsedEmitter.fire(this.collapsed);
            this.body.style.display = this.collapsed ? 'none' : 'block';
            // tslint:disable-next-line:no-shadowed-variable
            const toggleIcon = this.header.querySelector(`span.${EXPANSION_TOGGLE_CLASS}`);
            if (toggleIcon) {
                toggleIcon.classList.toggle(COLLAPSED_CLASS);
            }
            this.update();
        }));

        const toggleIcon = document.createElement('span');
        toggleIcon.classList.add(EXPANSION_TOGGLE_CLASS);
        if (this.collapsed) {
            toggleIcon.classList.add(COLLAPSED_CLASS);
        }
        header.appendChild(toggleIcon);

        const title = document.createElement('span');
        title.classList.add('label', 'noselect');
        title.innerText = this.wrapped.title.label;
        header.appendChild(title);

        if (ViewContainerPartWidget.is(this.wrapped)) {
            for (const { tooltip, execute, className } of this.wrapped.toolbarElements.filter(e => e.enabled !== false)) {
                const toolbarItem = document.createElement('span');
                toolbarItem.classList.add('element');
                if (className) {
                    // XXX: `className` should be `MaybeArray<string>` instead.
                    toolbarItem.classList.add(...className.split(' '));
                }
                toolbarItem.title = tooltip;
                disposable.push(addEventListener(toolbarItem, 'click', async event => {
                    event.stopPropagation();
                    event.preventDefault();
                    await execute();
                    this.update();
                }));
                header.appendChild(toolbarItem);
            }
        }
        return {
            header,
            disposable
        };
    }

    onAfterAttach(msg: Message): void {
        MessageLoop.sendMessage(this.wrapped, Widget.Msg.BeforeAttach);
        if (this.wrapped.isAttached) {
            Widget.detach(this.wrapped);
        }
        Widget.attach(this.wrapped, this.body);
        MessageLoop.sendMessage(this.wrapped, Widget.Msg.AfterAttach);
        this.update();
        super.onAfterAttach(msg);
    }

    onUpdateRequest(msg: Message): void {
        if (this.wrapped.isAttached) {
            this.wrapped.update();
        }
        super.onUpdateRequest(msg);
    }

}

export namespace ViewContainerPart {

    export function closestPart(element: Element | EventTarget | null, selector: string = 'div.part'): Element | undefined {
        if (element instanceof Element) {
            const part = element.closest(selector);
            if (part instanceof Element) {
                return part;
            }
        }
        return undefined;
    }
}

export interface ViewContainerPartToolbarElement {
    /** default true */
    readonly enabled?: boolean
    readonly className: string
    readonly tooltip: string
    // tslint:disable-next-line:no-any
    execute(): any
}

export interface ViewContainerPartWidget extends Widget {
    readonly toolbarElements: ViewContainerPartToolbarElement[];
}

export namespace ViewContainerPartWidget {
    export function is(widget: Widget | undefined): widget is ViewContainerPartWidget {
        return !!widget && ('toolbarElements' in widget);
    }
}
