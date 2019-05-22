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
import * as React from 'react';
import 'react-reflex/styles.css';
import { ReflexContainer, ReflexSplitter, ReflexElement, ReflexElementProps } from 'react-reflex';
import { ReactWidget, Widget, EXPANSION_TOGGLE_CLASS, COLLAPSED_CLASS, MessageLoop, Message } from './widgets';
import { Disposable } from '../common/disposable';
import { MaybePromise } from '../common/types';
import { CommandRegistry } from '../common/command';
import { MenuModelRegistry, MenuPath } from '../common/menu';
import { ContextMenuRenderer } from './context-menu-renderer';
import { ApplicationShell } from './shell/application-shell';

const backgroundColor = () => '#' + (0x1000000 + (Math.random()) * 0xffffff).toString(16).substr(1, 6);

export class ViewContainer extends ReactWidget implements ApplicationShell.TrackableWidgetProvider {

    protected readonly props: ViewContainer.Prop[] = [];

    constructor(protected readonly services: ViewContainer.Services, ...props: ViewContainer.Prop[]) {
        super();
        this.addClass(ViewContainer.Styles.VIEW_CONTAINER_CLASS);
        for (const descriptor of props) {
            this.toDispose.push(this.addWidget(descriptor));
        }
    }

    render() {
        return <ViewContainerComponent
            viewContainerId={this.id}
            widgets={this.props.map(prop => prop.widget)}
            services={this.services}
            contextMenuPath={this.contextMenuPath}
        />;
    }

    addWidget(prop: ViewContainer.Prop): Disposable {
        if (this.props.indexOf(prop) !== -1) {
            return Disposable.NULL;
        }
        this.props.push(prop);
        this.update();
        return Disposable.create(() => this.removeWidget(prop.widget));
    }

    removeWidget(widget: Widget): boolean {
        const index = this.props.map(p => p.widget).indexOf(widget);
        if (index === -1) {
            return false;
        }
        this.props.splice(index, 1);
        this.update();
        return true;
    }

    protected onResize(msg: Widget.ResizeMessage): void {
        super.onResize(msg);
        this.props.forEach(prop => MessageLoop.sendMessage(prop.widget, Widget.ResizeMessage.UnknownSize));
    }

    protected onUpdateRequest(msg: Message): void {
        this.props.forEach(prop => prop.widget.update());
        super.onUpdateRequest(msg);
    }

    onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        const prop = this.props.values().next().value;
        if (prop) {
            prop.widget.activate();
        }
    }

    getTrackableWidgets(): MaybePromise<Widget[]> {
        return this.props.map(p => p.widget);
    }

    protected get contextMenuPath(): MenuPath {
        return [`${this.id}-context-menu`];
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
    export namespace Styles {
        export const VIEW_CONTAINER_CLASS = 'theia-view-container';
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

export class ViewContainerComponent extends React.Component<ViewContainerComponent.Props, ViewContainerComponent.State> {

    protected container: HTMLElement | null;

    constructor(props: Readonly<ViewContainerComponent.Props>) {
        super(props);
        const widgets: Array<{ widget: Widget, hidden?: boolean } & ReflexElementProps> = [];
        const { commandRegistry, menuRegistry } = this.props.services;
        const { contextMenuPath } = this.props;
        for (let i = 0; i < props.widgets.length; i++) {
            const widget = props.widgets[i];
            const { id } = widget;
            const hidden = false;
            widgets.push({
                widget,
                direction: i === 0 ? 1 : i === props.widgets.length - 1 ? -1 : [1, -1],
                minSize: 50,
                hidden // TODO: consider WidgetOptions#hideByDefault
            });
            const commandId = this.toggleVisibilityCommandId(widget);
            commandRegistry.registerCommand({ id: commandId }, {
                execute: () => {
                    const widgetToToggle = this.state.widgets.find(w => w.widget.id === id);
                    if (widgetToToggle) {
                        widgetToToggle.hidden = !widgetToToggle.hidden;
                        this.setState(this.state);
                    }
                },
                isToggled: () => {
                    const widgetToToggle = this.state.widgets.find(w => w.widget.id === id);
                    if (widgetToToggle) {
                        return !widgetToToggle.hidden;
                    }
                    return false;
                }
            });
            menuRegistry.registerMenuAction(contextMenuPath, {
                commandId: commandId,
                label: widget.title.label
            });
        }
        this.state = {
            widgets
        };
    }

    protected toggleVisibilityCommandId({ id }: { id: string }): string {
        return `${this.props.viewContainerId}:toggle-visibility-${id}`;
    }

    componentDidMount(): void {
        if (this.container) {
            const { clientHeight: height, clientWidth: width } = this.container;
            this.setState({
                dimensions: { height, width }
            });
        }
    }

    componentWillUnmount(): void {
        const { commandRegistry, menuRegistry } = this.props.services;
        for (const { widget } of this.state.widgets) {
            const commandId = this.toggleVisibilityCommandId(widget);
            commandRegistry.unregisterCommand(commandId);
            menuRegistry.unregisterMenuAction(commandId);
        }
    }

    protected onExpandedChange = (widget: Widget, expanded: boolean) => {
        const { widgets } = this.state;
        const index = widgets.findIndex(part => part.widget.id === widget.id);
        if (index !== -1) {
            widgets[index].minSize = expanded ? 50 : 22;
            this.setState({
                widgets
            });
        }
    }

    protected movedBefore = (movedId: string, beforeId: string) => {
        const movedIndex = this.state.widgets.findIndex(({ widget }) => widget.id === movedId);
        const beforeIndex = this.state.widgets.findIndex(({ widget }) => widget.id === beforeId);
        if (movedIndex !== -1 && beforeIndex !== -1) {
            const { widgets } = this.state;
            const toMove = widgets.splice(movedIndex, 1)[0];
            if (toMove) {
                widgets.splice(beforeIndex, 0, toMove);
                this.setState({
                    widgets
                });
            }
        }
    }

    render(): React.ReactNode {
        const nodes: React.ReactNode[] = [];
        for (let i = 0; i < this.state.widgets.length; i++) {
            const { widget } = this.state.widgets[i];
            const { id } = widget;
            if (!this.state.widgets[i].hidden) {
                if (nodes.length !== 0) {
                    nodes.push(<ReflexSplitter key={`splitter-${id}`} propagate={true} />);
                }
                nodes.push(<ViewContainerPart
                    key={id}
                    widget={widget}
                    {...this.state.widgets[i]}
                    onExpandedChange={this.onExpandedChange}
                    movedBefore={this.movedBefore}
                    contextMenuRender={this.props.services.contextMenuRenderer}
                    contextMenuPath={this.props.contextMenuPath}
                />);
            }
        }
        return <div className={ViewContainerComponent.Styles.ROOT} ref={(element => this.container = element)}>
            {this.state.dimensions ? <ReflexContainer orientation='horizontal'>{nodes}</ReflexContainer> : ''}
        </div>;
    }

}
export namespace ViewContainerComponent {
    export interface Props {
        viewContainerId: string;
        widgets: Widget[];
        services: ViewContainer.Services;
        contextMenuPath: MenuPath;
    }
    export interface State {
        dimensions?: { height: number, width: number }
        widgets: Array<{ widget: Widget, hidden?: boolean } & ReflexElementProps>
    }
    export namespace Styles {
        export const ROOT = 'root';
    }
}

export class ViewContainerPart extends React.Component<ViewContainerPart.Props, ViewContainerPart.State> {

    constructor(props: ViewContainerPart.Props) {
        super(props);
        this.state = {
            expanded: true,
            size: -1
        };
    }

    protected detaching = false;
    componentWillUnmount(): void {
        const { widget } = this.props;
        if (widget.isAttached) {
            this.detaching = true;
            MessageLoop.sendMessage(widget, Widget.Msg.BeforeDetach);
        }
    }

    protected onDragStart = (e: React.DragEvent<HTMLDivElement>, widget: Widget) => {
        const { dataTransfer } = e;
        if (dataTransfer) {
            dataTransfer.effectAllowed = 'move';
            const dragImage = document.createElement('div');
            dragImage.classList.add('theia-drag-image');
            dragImage.textContent = widget.title.label;
            document.body.appendChild(dragImage);
            dataTransfer.setDragImage(dragImage, -10, -10);
            dataTransfer.setData('view-container-dnd', widget.id);
            setTimeout(() => document.body.removeChild(dragImage), 0);
        }
    }

    protected onDragOver = (e: React.DragEvent<HTMLDivElement>, widget: Widget) => {
        e.preventDefault();
        const reflexElement = this.closestPart(e.target);
        if (reflexElement instanceof HTMLElement) {
            reflexElement.classList.add(ViewContainerPart.Styles.DROP_TARGET);
        }
    }

    protected onDrop = (e: React.DragEvent<HTMLDivElement>, widget: Widget) => {
        const moveId = e.dataTransfer.getData('view-container-dnd');
        if (moveId && moveId !== widget.id) {
            this.props.movedBefore(moveId, widget.id);
        }
        e.preventDefault();
        const part = this.closestPart(e.target);
        if (part instanceof HTMLElement) {
            part.classList.remove(ViewContainerPart.Styles.DROP_TARGET);
        }
    }

    protected onDragLeave = (e: React.DragEvent<HTMLDivElement>, widget: Widget) => {
        e.preventDefault();
        const part = this.closestPart(e.target);
        if (part instanceof HTMLElement) {
            part.classList.remove(ViewContainerPart.Styles.DROP_TARGET);
        }
    }

    private closestPart(element: Element | EventTarget, selector: string = `div.${ViewContainerPart.Styles.PART}`): Element | undefined {
        if (element instanceof Element) {
            const part = element.closest(selector);
            if (part instanceof Element) {
                return part;
            }
        }
        return undefined;
    }

    render(): React.ReactNode {
        const { widget } = this.props;
        const toggleClassNames = [EXPANSION_TOGGLE_CLASS];
        if (!this.state.expanded) {
            toggleClassNames.push(COLLAPSED_CLASS);
        }
        const toggleClassName = toggleClassNames.join(' ');
        const reflexProps = Object.assign({ ...this.props }, { minSize: this.state.expanded ? 50 : 22 });
        return <ReflexElement size={this.state.expanded ? this.state.size : 0} {...reflexProps}>
            <div className={ViewContainerPart.Styles.PART}
                onDragOver={e => this.onDragOver(e, widget)}
                onDragLeave={e => this.onDragLeave(e, widget)}
                onDrop={e => this.onDrop(e, widget)}>
                <div className={`theia-header ${ViewContainerPart.Styles.HEADER}`}
                    title={widget.title.caption}
                    onClick={this.toggle}
                    onContextMenu={this.handleContextMenu}
                    draggable
                    onDragStart={e => this.onDragStart(e, widget)}>
                    <span className={toggleClassName} />
                    <span className={`${ViewContainerPart.Styles.LABEL} noselect`}>{widget.title.label}</span>
                    {this.state.expanded && this.renderToolbar()}
                </div>
                {this.state.expanded && <div className={ViewContainerPart.Styles.BODY} ref={this.setRef}
                />}
            </div>
        </ReflexElement>;
    }

    protected renderToolbar(): React.ReactNode {
        const { widget } = this.props;
        if (!ViewContainerPartWidget.is(widget)) {
            return undefined;
        }
        return <React.Fragment>
            {widget.toolbarElements.map((element, key) => this.renderToolbarElement(key, element))}
        </React.Fragment>;
    }

    protected renderToolbarElement(key: number, element: ViewContainerPartToolbarElement): React.ReactNode {
        if (element.enabled === false) {
            return undefined;
        }
        const { className, tooltip, execute } = element;
        const classNames = [ViewContainerPart.Styles.ELEMENT];
        if (className) {
            classNames.push(className);
        }
        return <span key={key}
            title={tooltip}
            className={classNames.join(' ')}
            onClick={async e => {
                e.stopPropagation();
                e.preventDefault();
                await execute();
                this.forceUpdate();
            }} />;
    }

    protected handleContextMenu = (event: React.MouseEvent<HTMLElement>) => {
        const { nativeEvent } = event;
        // Secondary button pressed, usually the right button.
        if (nativeEvent.button === 2 /* right */) {
            event.stopPropagation();
            event.preventDefault();
            const { contextMenuRender, contextMenuPath } = this.props;
            contextMenuRender.render(contextMenuPath, event.nativeEvent);
        }
    }

    protected toggle = () => {
        if (this.state.expanded) {
            Widget.detach(this.props.widget);
        }
        const expanded = !this.state.expanded;
        this.setState({
            expanded
        });
        if (this.props.onExpandedChange) {
            this.props.onExpandedChange(this.props.widget, expanded);
        }
    }

    protected ref: HTMLElement | undefined;
    protected setRef = (ref: HTMLElement | null) => {
        const { widget } = this.props;
        if (ref) {
            MessageLoop.sendMessage(widget, Widget.Msg.BeforeAttach);
            // tslint:disable:no-null-keyword
            ref.insertBefore(widget.node, null);
            MessageLoop.sendMessage(widget, Widget.Msg.AfterAttach);
            widget.update();
        } else if (this.detaching) {
            this.detaching = false;
            MessageLoop.sendMessage(widget, Widget.Msg.AfterDetach);
        }
    }

}

export namespace ViewContainerPart {
    export interface Props extends ReflexElementProps {
        readonly contextMenuRender: ContextMenuRenderer;
        readonly contextMenuPath: MenuPath;
        readonly widget: Widget;
        onExpandedChange(widget: Widget, expanded: boolean): void;
        /**
         * `movedId` the ID of the widget to insert before the widget with `beforeId`.
         */
        movedBefore(movedId: string, beforeId: string): void;
    }
    export interface State {
        expanded: boolean;
        size: number;
    }
    export namespace Styles {
        export const PART = 'part';
        export const HEADER = 'header';
        export const LABEL = 'label';
        export const ELEMENT = 'element';
        export const BODY = 'body';
        export const DROP_TARGET = 'drop-target';
    }
}

// const SortableViewContainerPart = SortableElement(ViewContainerPart);

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
