export * from './constants'
export * from './utils'

import { SceneNode } from './SceneNode'
import { TransformNode } from './TransformNode'
import { PositionNode } from './PositionNode'
import { SizeNode } from './SizeNode'
import { OpacityNode } from './OpacityNode'
import { ShadowNode } from './ShadowNode'
import { TextNode } from './TextNode'
import { TimerNode } from './TimerNode'
import { AnimationNode } from './AnimationNode'
import { BoxNode } from './BoxNode'
import { GroupNode } from './GroupNode'
import { ImageNode } from './ImageNode'
import { VideoNode } from './VideoNode'
import { BackgroundAnimationNode } from './BackgroundAnimationNode'
import { SoundNode } from './SoundNode'
import { EventNode } from './EventNode'
import { RandomSourceNode } from './RandomSourceNode'
import { RouletteSourceNode } from './RouletteSourceNode'
import { AudioPlayerNode } from './AudioPlayerNode'
import { OrderingNode } from './OrderingNode'
import { HideNode } from './HideNode'
import { StartNode } from './StartNode'
import { TaskNode } from './TaskNode'
import { WaitNode } from './WaitNode'
import { EndNode } from './EndNode'

export const nodeTypes = {
  scene: SceneNode,
  transform: TransformNode,
  position: PositionNode,
  size: SizeNode,
  opacity: OpacityNode,
  shadow: ShadowNode,
  text: TextNode,
  timer: TimerNode,
  animation: AnimationNode,
  box: BoxNode,
  group: GroupNode,
  image: ImageNode,
  video: VideoNode,
  backgroundAnimation: BackgroundAnimationNode,
  sound: SoundNode,
  event: EventNode,
  randomSource: RandomSourceNode,
  rouletteSource: RouletteSourceNode,
  audioPlayer: AudioPlayerNode,
  ordering: OrderingNode,
  hide: HideNode,
  start: StartNode,
  task: TaskNode,
  wait: WaitNode,
  end: EndNode
}
