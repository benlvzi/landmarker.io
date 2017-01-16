import * as THREE from 'three'
import { Landmark, Intersection } from '../base'
import { Viewport } from '../index'
import { listenOnce } from '../lib/event'
import { findClosestLandmarks } from './base'

enum Handle {
    TL, // top left
    TR, // top right
    BL, // bottom left
    BR // bottom right
}

/**
 * Holds state usable by all event handlers and should be bound to the
 * Viewport view instance.
 */
export class MouseHandler {

    viewport: Viewport
    _currentTargetLmIndex: number = null

    downEvent: MouseEvent = null
    lmPressed: Landmark = null
    isPressed = false

    onMouseDownPosition = new THREE.Vector2()
    onMouseUpPosition = new THREE.Vector2()
    positionLmDrag =  new THREE.Vector2()

    dragStartPositions = []
    dragged = false
    intersectsWithLms: Intersection[] = []
    intersectsWithMesh: Intersection[] = []

    handlePressed: Handle

    constructor(viewport: Viewport) {
        this.viewport = viewport
    }

    get currentTargetLm (): Landmark {
      return this._currentTargetLmIndex !== null ?
          this.viewport.landmarks[this._currentTargetLmIndex] :
          null
    }

    set currentTargetLm (targetLm: Landmark) {
        if (targetLm === null) {
            this._currentTargetLmIndex = null
        } else {
            this._currentTargetLmIndex = targetLm.index
        }
    }

    // High level handlers
    // these functions respond to changes in the mesh and landamrks state.
    // lower level handlers below reponding to raw input (e.g. onMouseDown) will
    // resolve what item is being interacted with and delegate to these methods
    // as appropriate.
    // ------------------------------------------------------------------------

    meshPressed = () => {
        console.log('mesh pressed!')
        if (this.viewport.groupModeActive) {
            this.nothingPressed()
        } else if (this.downEvent.button === 0 && this.downEvent.shiftKey) {
            this.shiftPressed()  // LMB + SHIFT
        } else {
            listenOnce(document, 'mouseup', this.meshOnMouseUp)
        }
    }

    // called when the landmarks are changed on the viewport.
    resetLandmarks = () => {
        this.currentTargetLm = null
    }

    landmarkPressed = () => {
        var ctrl = this.downEvent.ctrlKey || this.downEvent.metaKey
        console.log('Viewport: landmark pressed')
        // before anything else, disable the camera
        this.viewport.cameraIsLocked = true
        // the clicked on landmark
        var landmarkSymbol = this.intersectsWithLms[0].object
        // hunt through the landmarkViews for the right symbol
        console.log(landmarkSymbol)

        this.viewport.scene.landmarkViews
            .filter(lmv => lmv.symbol === landmarkSymbol)
            .forEach(lmv => this.lmPressed = this.viewport.landmarks[lmv.index])
        console.log('Viewport: finding the selected points')

        if (!this.lmPressed.isSelected && !ctrl) {
            // this lm wasn't pressed before and we aren't holding
            // mutliselection down - deselect rest and select this
            console.log("normal click on a unselected lm - deselecting rest and selecting me")
            this.viewport.on.selectLandmarkAndDeselectRest(this.lmPressed.index)
        } else if (ctrl && !this.lmPressed.isSelected) {
            this.viewport.on.selectLandmarks([this.lmPressed.index])
        }

        // record the position of where the drag started.
        this.positionLmDrag.copy(this.viewport.scene.localToScreen(this.lmPressed.point))
        this.dragStartPositions = this.viewport.selectedLandmarks
            .map(lm => [lm.index, lm.point.clone()])

        // start listening for dragging landmarks
        document.addEventListener('mousemove', this.landmarkOnDrag)
        listenOnce(document, 'mouseup', this.landmarkOnMouseUp)
    }

    nothingPressed = () => {
        console.log('nothing pressed!')
        listenOnce(document, 'mouseup', this.nothingOnMouseUp)
    }

    shiftPressed = () => {
        console.log('shift pressed!')
        // before anything else, disable the camera
        this.viewport.cameraIsLocked = true

        if (!(this.downEvent.ctrlKey || this.downEvent.metaKey)) {
            this.viewport.on.deselectAllLandmarks()
        }
        document.addEventListener('mousemove', this.shiftOnDrag)
        listenOnce(document, 'mouseup', this.shiftOnMouseUp)
    }

    selectionHandlePressed = () => {
        console.log('selection handle pressed!')
        // before anything else, disable the camera
        this.viewport.cameraIsLocked = true

        // record the starting positions of selected landmarks
        this.dragStartPositions = this.viewport.selectedLandmarks
            .map(lm => [lm.index, lm.point.clone()])

        // start listening for dragging selection handle
        document.addEventListener('mousemove', this.selectionHandleOnDrag)
        listenOnce(document, 'mouseup', this.selectionHandleOnMouseUp)
    }

    mouseDownOnSelectionHandle = () => {
        const md = this.onMouseDownPosition
        const sb = this.viewport.selectionBox
        if (sb.minPosition.x === -1 && sb.minPosition.y === -1 && sb.maxPosition.x === -1 && sb.maxPosition.y === -1) {
            console.log("inactive!!!")
            return false
        }
        if (md.x <= sb.minPosition.x + 3 && md.x >= sb.minPosition.x - 3 && md.y <= sb.minPosition.y + 3 && md.y >= sb.minPosition.y - 3) {
            this.handlePressed = Handle.TL
            return true
        } else if (md.x <= sb.minPosition.x + 3 && md.x >= sb.minPosition.x - 3 && md.y <= sb.maxPosition.y + 3 && md.y >= sb.maxPosition.y - 3) {
            this.handlePressed = Handle.BL
            return true
        } else if (md.x <= sb.maxPosition.x + 3 && md.x >= sb.maxPosition.x - 3 && md.y <= sb.minPosition.y + 3 && md.y >= sb.minPosition.y - 3) {
            this.handlePressed = Handle.TR
            return true
        } else if (md.x <= sb.maxPosition.x + 3 && md.x >= sb.maxPosition.x - 3 && md.y <= sb.maxPosition.y + 3 && md.y >= sb.maxPosition.y - 3) {
            this.handlePressed = Handle.BR
            return true
        }
        return false
        // return (md.x <= sb.minPosition.x + 3 && md.x >= sb.minPosition.x - 3 && md.y <= sb.minPosition.y + 3 && md.y >= sb.minPosition.y - 3)
        // || (md.x <= sb.minPosition.x + 3 && md.x >= sb.minPosition.x - 3 && md.y <= sb.maxPosition.y + 3 && md.y >= sb.maxPosition.y - 3)
        // || (md.x <= sb.maxPosition.x + 3 && md.x >= sb.maxPosition.x - 3 && md.y <= sb.minPosition.y + 3 && md.y >= sb.minPosition.y - 3)
        // || (md.x <= sb.maxPosition.x + 3 && md.x >= sb.maxPosition.x - 3 && md.y <= sb.maxPosition.y + 3 && md.y >= sb.maxPosition.y - 3)
        // return (md.x <= sb.minPosition.x + 3 && md.x >= sb.minPosition.x - 3 && ((md.y <= sb.minPosition.y + 3 && md.y >= sb.minPosition.y - 3)
        // || (md.y <= sb.maxPosition.y + 3 && md.y >= sb.maxPosition.y - 3)))
        // || (md.x <= sb.maxPosition.x + 3 && md.x >= sb.maxPosition.x - 3 && ((md.y <= sb.minPosition.y + 3 && md.y >= sb.minPosition.y)
        // || (md.y <= sb.maxPosition.y + 3 && md.y >= sb.maxPosition.y - 3)))
    }

    // Catch all clicks and delegate to other handlers once user's intent
    // has been figured out
    onMouseDown = (event: MouseEvent) => {
        event.preventDefault()
        this.viewport.focus()

        if (!this.viewport.hasLandmarks) {
            return
        }

        this.isPressed = true

        this.downEvent = event
        this.onMouseDownPosition.set(event.clientX, event.clientY)

        // All interactions require intersections to distinguish
        this.intersectsWithLms = this.viewport.scene.getIntersectsFromEvent(
            event, this.viewport.scene.sLms)
        // note that we explicitly ask for intersects with the mesh
        // object as we know get intersects will use an octree if
        // present.
        this.intersectsWithMesh = this.viewport.scene.getIntersectsFromEvent(event, this.viewport.scene.mesh)

        const mouseDownOnSelectionHandle = this.mouseDownOnSelectionHandle()

        // Click type, we use MouseEvent.button which is the vanilla JS way
        // jQuery also exposes event.which which has different bindings
        if (event.button === 0) {  // left mouse button
            if (this.intersectsWithLms.length > 0 &&
                this.intersectsWithMesh.length > 0) {
                // degenerate case - which is closer?
                // selection handle takes precedence over landmark
                if (this.intersectsWithLms[0].distance <
                    this.intersectsWithMesh[0].distance && !mouseDownOnSelectionHandle) {
                    this.landmarkPressed()
                } else {
                    // the mesh was pressed. Check for selection handle first and shift second.
                    if (mouseDownOnSelectionHandle) {
                        this.selectionHandlePressed()
                    } if (event.shiftKey) {
                        this.shiftPressed()
                    } else if (this.viewport.snapModeEnabled && this.currentTargetLm !== null) {
                        this.meshPressed()
                    } else {
                        this.nothingPressed()
                    }
                }
            } else if (mouseDownOnSelectionHandle) {
                this.selectionHandlePressed()
            } else if (this.intersectsWithLms.length > 0) {
                this.landmarkPressed()
            } else if (event.shiftKey) {
                // shift trumps all!
                this.shiftPressed()
            } else if (
                this.intersectsWithMesh.length > 0 &&
                this.viewport.snapModeEnabled
            ) {
                this.meshPressed()
            } else {
                this.nothingPressed()
            }
        } else if (event.button === 2) { // Right click
            if (
                this.intersectsWithLms.length <= 0 &&
                this.intersectsWithMesh.length > 0
            ) {
                this.viewport.on.deselectAllLandmarks()
                this.currentTargetLm = null
                this.meshPressed()
            }
        }
        this.viewport.requestUpdate()
    }

    // Drag Handlers
    // ------------------------------------------------------------------------
    landmarkOnDrag = (event: MouseEvent) => {
        console.log("drag")
        // note that positionLmDrag is set to where we started.
        // update where we are now and where we were
        var newPositionLmDrag = new THREE.Vector2(
            event.clientX, event.clientY)
        var prevPositionLmDrag = this.positionLmDrag.clone()
        // change in this step in screen space

        // vector difference in one time step
        const deltaLmDrag = new THREE.Vector2()
        deltaLmDrag.subVectors(newPositionLmDrag, prevPositionLmDrag)
        // update the position
        this.positionLmDrag.copy(newPositionLmDrag)
        this.viewport.selectedLandmarks.forEach(lm => {
            // convert to screen coordinates
            const vScreen = this.viewport.scene.localToScreen(lm.point)

            // budge the screen coordinate
            vScreen.add(deltaLmDrag)

            // use the standard machinery to find intersections
            // note that we intersect the mesh to use the octree
            this.intersectsWithMesh = this.viewport.scene.getIntersects(
                vScreen.x, vScreen.y, this.viewport.scene.mesh)
            if (this.intersectsWithMesh.length > 0) {
                // good, we're still on the mesh.
                this.dragged = !!this.dragged || true
                this.viewport.on.setLandmarkPointWithoutHistory(lm.index,
                    this.viewport.scene.worldToLocal(this.intersectsWithMesh[0].point))
            } else {
                // don't update point - it would fall off the surface.
                console.log("fallen off mesh")
            }
        })
        this.viewport.requestUpdate()
    }

    shiftOnDrag = (event: MouseEvent) => {
        console.log("shift:drag")
        // note - we use client as we don't want to jump back to zero
        // if user drags into sidebar!
        var newPosition = new THREE.Vector2(event.clientX, event.clientY)
        // clear the canvas and draw a selection rect.
        this.viewport.clearCanvas()
        this.viewport.canvas.drawSelectionBox(this.onMouseDownPosition, newPosition)
    }

    selectionHandleOnDrag = (event: MouseEvent) => {
        console.log("selection handle:drag")
        const oldMin = this.viewport.selectionBox.minPosition
        const oldMax = this.viewport.selectionBox.maxPosition
        const newMin = oldMin.clone()
        const newMax = oldMax.clone()
        if (this.handlePressed === Handle.TL) {
            newMin.set(event.clientX, event.clientY)
        } else if (this.handlePressed === Handle.BR) {
            newMax.set(event.clientX, event.clientY)
        } else if (this.handlePressed === Handle.TR) {
            newMin.y = event.clientY
            newMax.x = event.clientX
        } else {
            newMin.x = event.clientX
            newMax.y = event.clientY
        }
        this.viewport.selectedLandmarks.forEach(lm => {
            // convert to screen coordinates
            const oldLmPos = this.viewport.scene.localToScreen(lm.point)

            // Calculate new coordinates based on new selection box
            const deltaX = (oldLmPos.x - oldMin.x) / (oldMax.x - oldMin.x)
            const deltaY = (oldLmPos.y - oldMin.y) / (oldMax.y - oldMin.y)
            const newLmX = (deltaX * (newMax.x - newMin.x)) + newMin.x
            const newLmY = (deltaY * (newMax.y - newMin.y)) + newMin.y

            // use the standard machinery to find intersections
            // note that we intersect the mesh to use the octree
            this.intersectsWithMesh = this.viewport.scene.getIntersects(
                newLmX, newLmY, this.viewport.scene.mesh)
            if (this.intersectsWithMesh.length > 0) {
                // good, we're still on the mesh.
                this.dragged = !!this.dragged || true
                this.viewport.on.setLandmarkPointWithoutHistory(lm.index,
                    this.viewport.scene.worldToLocal(this.intersectsWithMesh[0].point))
            } else {
                // don't update point - it would fall off the surface.
                console.log("fallen off mesh")
            }
        })
        this.viewport.requestUpdate()
    }

    // Up handlers
    // ------------------------------------------------------------------------

    shiftOnMouseUp = (event: MouseEvent) => {
        this.viewport.cameraIsLocked = false
        console.log("shift:up")
        document.removeEventListener('mousemove', this.shiftOnDrag)
        var x1 = this.onMouseDownPosition.x
        var y1 = this.onMouseDownPosition.y
        var x2 = event.clientX
        var y2 = event.clientY
        let minX: number, maxX: number, minY: number, maxY: number
        if (x1 < x2) {
            [minX, maxX] = [x1, x2]
        } else {
            [minX, maxX] = [x2, x1]
        }
        if (y1 < y2) {
            [minY, maxY] = [y1, y2]
        } else {
            [minY, maxY] = [y2, y1]
        }
        // First, let's just find all the landmarks in screen space that
        // are within our selection.
        var lms = this.viewport.scene.lmViewsInSelectionBox(minX, minY, maxX, maxY)

        // Of these, filter out the ones which are visible (not
        // obscured) and select the rest
        const indexesToSelect = lms.filter(this.viewport.scene.lmViewVisible).map(lm => lm.index)
        this.viewport.on.selectLandmarks(indexesToSelect)
        this.viewport.requestUpdateAndRefreshCanvas()
        this.isPressed = false
    }

    meshOnMouseUp = (event: MouseEvent) => {
        console.log("meshPress:up")
        this.onMouseUpPosition.set(event.clientX, event.clientY)
        if (this.onMouseDownPosition.distanceTo(this.onMouseUpPosition) < 2) {
            //  a click on the mesh
            // Convert the point back into the mesh space
            const p = this.viewport.scene.worldToLocal(this.intersectsWithMesh[0].point)
            if (
                this.viewport.snapModeEnabled &&
                this.currentTargetLm !== null &&
                this.currentTargetLm.point !== null
            ) {
                // we are in edit mode - adjust the target point
                this.viewport.on.setLandmarkPoint(this.currentTargetLm.index, p)
            } else if (this.downEvent.button === 2) {
                // right click - insert point.
                this.viewport.on.insertNewLandmark(p)
            }
        }
        this.isPressed = false
        this.viewport.clearCanvas()
    }

    nothingOnMouseUp = (event: MouseEvent) => {
        console.log("nothingPress:up")
        this.onMouseUpPosition.set(event.clientX, event.clientY)
        if (this.onMouseDownPosition.distanceTo(this.onMouseUpPosition) < 2) {
            // a click on nothing - deselect all
            this.viewport.on.deselectAllLandmarks()
        }
        this.isPressed = false
        this.viewport.clearCanvas()
        this.viewport.updateSelectionBox()
    }

    landmarkOnMouseUp = (event: MouseEvent) => {
        const ctrl = this.downEvent.ctrlKey || this.downEvent.metaKey
        this.viewport.cameraIsLocked = false
        console.log("landmarkPress:up")
        document.removeEventListener('mousemove', this.landmarkOnDrag)
        this.onMouseUpPosition.set(event.clientX, event.clientY)

        if (this.onMouseDownPosition.distanceTo(this.onMouseUpPosition) === 0) {
            // landmark was pressed
            if (this.lmPressed.isSelected && ctrl) {
                this.viewport.on.deselectLandmarks([this.lmPressed.index])
            } else if (!ctrl && !this.lmPressed.isSelected) {
                this.viewport.on.selectLandmarkAndDeselectRest(this.lmPressed.index)
            } else if (this.lmPressed.isSelected) {
                const p = this.viewport.scene.worldToLocal(this.intersectsWithMesh[0].point)
                this.viewport.on.setLandmarkPoint(this.lmPressed.index, p)
            }
        } else if (this.dragged) {
            this.viewport.selectedLandmarks.forEach((lm, i) => {
                this.dragStartPositions[i].push(lm.point.clone())
            })
            this.viewport.on.addLandmarkHistory(this.dragStartPositions)
        }

        this.viewport.requestUpdateAndRefreshCanvas()
        this.dragged = false
        this.dragStartPositions = []
        this.isPressed = false
    }

    selectionHandleOnMouseUp = (event: MouseEvent) => {
        this.viewport.cameraIsLocked = false
        console.log("handlePress:up")
        document.removeEventListener('mousemove', this.selectionHandleOnDrag)

        if (this.dragged) {
            this.viewport.selectedLandmarks.forEach((lm, i) => {
                this.dragStartPositions[i].push(lm.point.clone())
            })
            this.viewport.on.addLandmarkHistory(this.dragStartPositions)
        }

        this.viewport.requestUpdateAndRefreshCanvas()
        this.dragged = false
        this.dragStartPositions = []
        this.isPressed = false
    }

    // Move handlers
    // ------------------------------------------------------------------------
    onMouseMove = (event: MouseEvent) => {

        this.viewport.clearCanvas()

        // update and draw selection box if active
        this.viewport.updateSelectionBox()

        if (this.isPressed || !this.viewport.landmarkSnapPermitted) {
            return
        }

        // only here as:
        // 1. Edit mode is enabled
        // 2. No group selection is made
        // 3. There is at least one landmark

        if (this.currentTargetLm !== null && this.currentTargetLm.point === null)
        {
            // the target point has been deleted - reset it.
            this.currentTargetLm = null
        }

        this.intersectsWithMesh = this.viewport.scene.getIntersectsFromEvent(event, this.viewport.scene.mesh)

        if (this.intersectsWithMesh.length == 0) {
            // moving the mouse off the mesh does nothing.
            return
        }

        const mouseLoc = this.viewport.scene.worldToLocal(this.intersectsWithMesh[0].point)

        // lock only works once we have an existing target landmark
        const lockEnabled = (event.ctrlKey || event.metaKey) && this.currentTargetLm !== null

        let newTarget: Landmark, nextClosest: Landmark[] = []
        if (lockEnabled) {
            // we will not change the existing target
            newTarget = this.currentTargetLm

            // only pick from the remaining landmarks
            const candidateLandmarks = this.viewport.nonEmptyLandmarks
                .filter(lm => lm.index !== this.currentTargetLm.index)
            nextClosest = findClosestLandmarks(candidateLandmarks, mouseLoc, 3)

        } else {
            // need to chose a new target landmark and new next closest
            [newTarget, ...nextClosest] = findClosestLandmarks(this.viewport.nonEmptyLandmarks, mouseLoc, 4)
        }

        // Remember, we know there are >= 1 landmarks, so we always have a newTarget.
        // Draw it and the next closest on the UI....
        this.viewport.drawTargetingLines(new THREE.Vector2(event.clientX, event.clientY),
            newTarget, nextClosest)

        // and if we have a change of new target, update the selection
        if (!this.currentTargetLm !== null || newTarget.index !== this.currentTargetLm.index) {
            // target has changed, which triggers a change in selection
            this.viewport.on.selectLandmarkAndDeselectRest(newTarget.index)

            // finally, update the current target lm for next time around.
            this.currentTargetLm = newTarget
        }

        this.viewport.requestUpdate()
    }

}
