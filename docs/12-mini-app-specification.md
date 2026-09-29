# Mini App 规范

## Manifest

```ts
type MiniAppManifest = {
  id: string; name: string; version: string; route: string;
  permissions: string[]; dataScopes: string[];
  status: 'available' | 'planned' | 'disabled';
};
```

Mini App 生命周期：`registered -> enabled -> disabled -> retired`。数据访问必须经过 API 和权限层，不能直接连库、读其他模块原始数据或执行任意代码。

首期应用：`entertainment`（星座、天干地支、五行八卦和历法）和 `ticketing`（入口、偏好、任务状态占位）。娱乐内容必须标注娱乐/传统文化用途。

未来插件市场必须有签名、审核、沙箱、权限声明、资源配额和回滚机制。
