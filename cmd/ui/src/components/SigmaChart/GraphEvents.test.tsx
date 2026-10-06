// Copyright 2026 Specter Ops, Inc.
//
// Licensed under the Apache License, Version 2.0
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// SPDX-License-Identifier: Apache-2.0

import { MultiDirectedGraph } from 'graphology';
import { render } from 'src/test-utils';
import { EdgeDirection } from 'src/utils';
import { describe, expect, it, vi } from 'vitest';
import { GraphEvents } from './GraphEvents';

const { registerEventsMock, setSettingsMock, sigmaMock } = vi.hoisted(() => {
    return {
        registerEventsMock: vi.fn(),
        setSettingsMock: vi.fn(),
        sigmaMock: {
            getGraph: vi.fn(),
            getNodeDisplayData: vi.fn(),
            framedGraphToViewport: vi.fn(),
            graphToViewport: vi.fn(),
            viewportToFramedGraph: vi.fn(),
            getCamera: vi.fn(),
            getDimensions: vi.fn(),
            viewRectangle: vi.fn(),
            setCustomBBox: vi.fn(),
            scheduleRefresh: vi.fn(),
            refresh: vi.fn(),
            animate: vi.fn(),
        },
    };
});

vi.mock('@react-sigma/core', () => ({
    useSigma: () => sigmaMock,
    useRegisterEvents: () => registerEventsMock,
    useSetSettings: () => setSettingsMock,
}));

const FRAMED_GRAPH_TO_VIEWPORT_SCALE = 100;

const buildTestGraph = () => {
    const graph = new MultiDirectedGraph();

    graph.addNode('node-1', { x: 0.1, y: 0.1, size: 10, label: 'Node 1' });
    graph.addNode('node-2', { x: 0.5, y: 0.5, size: 10, label: 'Node 2' });

    // A group of parallel edges between the same two nodes, keyed by relationship id like the Explore graph does
    for (let i = 0; i < 3; i++) {
        graph.addEdgeWithKey(`rel_${i + 1}`, 'node-1', 'node-2', {
            size: 4,
            type: 'curved',
            label: `MemberOf${i}`,
            groupPosition: i,
            groupSize: 3,
            direction: EdgeDirection.FORWARDS,
        });
    }

    graph.addEdgeWithKey('rel_4', 'node-1', 'node-1', {
        size: 4,
        type: 'self',
        label: 'SelfEdge',
        groupPosition: 0,
        groupSize: 1,
    });

    return graph;
};

describe('GraphEvents', () => {
    let graph: MultiDirectedGraph;

    beforeEach(() => {
        graph = buildTestGraph();

        vi.clearAllMocks();

        sigmaMock.getGraph.mockReturnValue(graph);
        sigmaMock.getNodeDisplayData.mockImplementation((key: string) => graph.getNodeAttributes(key));
        sigmaMock.framedGraphToViewport.mockImplementation((coordinates: { x: number; y: number }) => ({
            x: coordinates.x * FRAMED_GRAPH_TO_VIEWPORT_SCALE,
            y: coordinates.y * FRAMED_GRAPH_TO_VIEWPORT_SCALE,
        }));
        sigmaMock.graphToViewport.mockImplementation((coordinates: { x: number; y: number }) => coordinates);
        sigmaMock.viewportToFramedGraph.mockImplementation((coordinates: { x: number; y: number }) => coordinates);
        sigmaMock.getCamera.mockReturnValue({
            ratio: 1,
            getState: () => ({ ratio: 1, x: 0.5, y: 0.5 }),
            animate: sigmaMock.animate,
        });
        sigmaMock.getDimensions.mockReturnValue({ width: 1000, height: 800 });
        sigmaMock.viewRectangle.mockReturnValue({ x1: 0, x2: 1000, y1: 0, y2: 800, width: 1000, height: 800 });
    });

    const getEdgeReducer = () => {
        render(<GraphEvents highlightedItem={null} />);

        const settingsWithReducers = setSettingsMock.mock.calls
            .map((call) => call[0])
            .find((settings) => settings?.edgeReducer);

        expect(settingsWithReducers).toBeDefined();

        return settingsWithReducers.edgeReducer;
    };

    describe('edgeReducer', () => {
        it('sets control points for curved edges keyed by relationship id', () => {
            const edgeReducer = getEdgeReducer();

            const reduced = edgeReducer('rel_1', graph.getEdgeAttributes('rel_1'));

            expect(reduced.control).toBeDefined();
            expect(reduced.controlInViewport).toBeDefined();
        });

        it('does not stack labels by giving each edge in a parallel edge group a distinct control point', () => {
            const edgeReducer = getEdgeReducer();

            const controlPoints = [1, 2, 3].map((i) => edgeReducer(`rel_${i}`, graph.getEdgeAttributes(`rel_${i}`)));

            // Each label in the group must be positioned along its own curve, not all at the shared straight-line midpoint.
            // The first edge of an odd-sized group is intentionally straight, so only the curved members must be off-midpoint.
            const viewportMidpoint = {
                x: 0.3 * FRAMED_GRAPH_TO_VIEWPORT_SCALE,
                y: 0.3 * FRAMED_GRAPH_TO_VIEWPORT_SCALE,
            };

            for (const reduced of controlPoints.slice(1)) {
                expect(reduced.controlInViewport).not.toEqual(viewportMidpoint);
            }

            const distinctControlPoints = new Set(controlPoints.map((reduced) => JSON.stringify(reduced.control)));
            expect(distinctControlPoints.size).toBe(3);
        });

        it('sets framedGraphNodeRadius for self edges keyed by relationship id', () => {
            const edgeReducer = getEdgeReducer();

            const reduced = edgeReducer('rel_4', graph.getEdgeAttributes('rel_4'));

            expect(typeof reduced.framedGraphNodeRadius).toBe('number');
            expect(reduced.framedGraphNodeRadius).toBeGreaterThan(0);
        });
    });
});
