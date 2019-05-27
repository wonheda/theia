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

import { enableJSDOM } from './test/jsdom';
let disableJSDOM = enableJSDOM();

import { Container, injectable } from 'inversify';
import { Widget } from './widgets';
import { ViewContainer } from './view-container';
import { MenuModelRegistry, MenuContribution } from '../common/menu';
import { CommandRegistry, CommandContribution } from '../common/command';
import { bindContributionProvider } from '../common/contribution-provider';
import { ContextMenuRenderer, Anchor } from './context-menu-renderer';

disableJSDOM();

describe('view-container', () => {

    before(() => disableJSDOM = enableJSDOM());

    after(() => disableJSDOM());

    it('baz', () => {
        const x = createViewContainer();
        console.log(x);
    });

    function createViewContainer(): ViewContainer {
        const container = new Container({ defaultScope: 'Singleton' });
        bindContributionProvider(container, CommandContribution);
        bindContributionProvider(container, MenuContribution);
        container.bind(CommandRegistry).toSelf().inSingletonScope();
        container.bind(MenuModelRegistry).toSelf().inSingletonScope();
        container.bind(NoopContextMenuRenderer).toSelf().inSingletonScope();
        container.bind(ContextMenuRenderer).toService(NoopContextMenuRenderer);

        const services = {
            commandRegistry: container.get(CommandRegistry),
            menuRegistry: container.get(MenuModelRegistry),
            contextMenuRenderer: container.get(ContextMenuRenderer) as ContextMenuRenderer
        };
        return new ViewContainer(services, ...[{ widget: new Widget() }]);
    }

});

@injectable()
class NoopContextMenuRenderer implements ContextMenuRenderer {

    render(menuPath: string[], anchor: Anchor): void {
        // NOOP
    }

}
