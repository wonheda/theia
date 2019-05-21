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
import { ContextMenuRenderer } from './context-menu-renderer';
import { ApplicationShell } from './shell/application-shell';
import { MaybePromise } from '../common/types';

// const backgroundColor = () => '#' + (0x1000000 + (Math.random()) * 0xffffff).toString(16).substr(1, 6);

export class ViewContainer extends ReactWidget implements ApplicationShell.TrackableWidgetProvider {

    protected readonly props: ViewContainer.Prop[] = [];

    constructor(protected readonly services: ViewContainer.Services, ...props: ViewContainer.Prop[]) {
        super();
        this.addClass(ViewContainer.Styles.VIEW_CONTAINER_CLASS);
        for (const descriptor of props) {
            // console.log('options', descriptor.options);
            this.toDispose.push(this.addWidget(descriptor));
        }
    }

    public render() {
        return <ViewContainerComponent widgets={this.props.map(prop => prop.widget)} services={this.services} />;
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

}

export namespace ViewContainer {
    export interface Prop {
        readonly widget: Widget;
        readonly options?: ViewContainer.Factory.WidgetOptions;
    }
    export interface Services {
        readonly contextMenuRenderer: ContextMenuRenderer;
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
        const widgets: Array<{ widget: Widget } & ReflexElementProps> = [];
        for (let i = 0; i < props.widgets.length; i++) {
            const widget = props.widgets[i];
            widgets.push({
                widget,
                direction: i === 0 ? 1 : i === props.widgets.length - 1 ? -1 : [1, -1],
                minSize: 50
            });
        }
        this.state = {
            widgets
        };
    }

    componentDidMount() {
        if (this.container) {
            const { clientHeight: height, clientWidth: width } = this.container;
            this.setState({
                dimensions: { height, width }
            });
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

    public render() {
        const nodes: React.ReactNode[] = [];
        for (const widget of this.state.widgets) {
            const { id } = widget.widget;
            if (nodes.length !== 0) {
                nodes.push(<ReflexSplitter key={`splitter-${id}`} propagate={true} />);
            }
            nodes.push(<ViewContainerPart key={id} widget={widget.widget} {...widget} onExpandedChange={this.onExpandedChange} />);
        }
        return <div className={ViewContainerComponent.Styles.ROOT} ref={(element => this.container = element)}>
            {this.state.dimensions ? <ReflexContainer orientation='horizontal'>{nodes}</ReflexContainer> : ''}
        </div>;
    }

}
export namespace ViewContainerComponent {
    export interface Props {
        widgets: Widget[];
        services: ViewContainer.Services;
    }
    export interface State {
        dimensions?: { height: number, width: number }
        widgets: Array<{ widget: Widget } & ReflexElementProps>
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

    render(): React.ReactNode {
        const { widget } = this.props;
        const toggleClassNames = [EXPANSION_TOGGLE_CLASS];
        if (!this.state.expanded) {
            toggleClassNames.push(COLLAPSED_CLASS);
        }
        const toggleClassName = toggleClassNames.join(' ');
        const reflexProps = Object.assign({ ...this.props }, { minSize: this.state.expanded ? 50 : 22 });
        return <ReflexElement size={this.state.expanded ? this.state.size : 0} {...reflexProps}>
            <div className={ViewContainerPart.Styles.PART}>
                <div className={`theia-header ${ViewContainerPart.Styles.HEADER}`}
                    title={widget.title.caption}
                    onClick={this.toggle}
                    onContextMenu={this.handleContextMenu}>
                    <span className={toggleClassName} />
                    <span className={`${ViewContainerPart.Styles.LABEL} noselect`}>{widget.title.label}</span>
                    {this.state.expanded && this.renderToolbar()}
                </div>
                {this.state.expanded && <div className={ViewContainerPart.Styles.BODY} ref={this.setRef} /*style={{ backgroundColor: backgroundColor() }}*/ />}
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
            console.log('heyho!!!');
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
        readonly widget: Widget;
        onExpandedChange?(widget: Widget, expanded: boolean): void;
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
