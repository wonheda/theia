/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
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
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { injectable, named, inject } from 'inversify';
import { ContributionProvider } from '@theia/core';

export const ScmResourceCommandContribution = Symbol('ScmResourceCommandContribution');

export interface ScmResourceCommandContribution {
    registerScmResourceCommands(registry: ScmResourceCommandRegistry): void;
}

export interface ScmResourceItem {
    command: string;
    group?: string;
}

@injectable()
export class ScmResourceCommandRegistry implements FrontendApplicationContribution {
    private items: Map<string, ScmResourceItem[]> = new Map();

    @inject(ContributionProvider)
    @named(ScmResourceCommandContribution)
    protected readonly contributionProvider: ContributionProvider<ScmResourceCommandContribution>;

    onStart(): void {
        const contributions = this.contributionProvider.getContributions();
        for (const contribution of contributions) {
            contribution.registerScmResourceCommands(this);
        }
    }

    registerItems(groupId: string, items: ScmResourceItem[]): void {
        const savedItems = this.items.get(groupId);
        if (savedItems) {
            items.forEach(item => savedItems.push(item));
            this.items.set(groupId, savedItems);
        } else {
            this.items.set(groupId, items);
        }
    }

    registerItem(groupId: string, item: ScmResourceItem): void {
        const items = this.items.get(groupId);
        if (items) {
            items.push(item);
            this.items.set(groupId, items);
        } else {
            this.items.set(groupId, [item]);
        }
    }

    getItems(groupId: string): ScmResourceItem[] | undefined {
        return this.items.get(groupId);
    }
}
