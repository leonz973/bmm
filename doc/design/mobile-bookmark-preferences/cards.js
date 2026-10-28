const descriptions = {
  GitHub: '发现开源项目，与开发者一起构建、审查和交付代码。',
  Figma: '在同一画布中完成界面设计、原型与团队协作。',
  Notion: '将笔记、文档和项目资料整理在一个工作空间。',
  ChatGPT: '通过对话获得写作、学习和编程方面的帮助。',
  'MDN Web Docs': '查阅 Web 标准、浏览器 API 与前端开发文档。',
  Vercel: '构建、预览并部署现代 Web 应用。',
  'Tailwind CSS': '使用工具类快速构建一致的响应式界面。',
  Linear: '为产品团队提供清晰的 issue 与迭代管理。',
  Dribbble: '发现界面、品牌与视觉设计作品。',
  Cloudflare: '为网站提供加速、安全与边缘计算服务。',
  'Google AI Studio': '体验并构建基于 Gemini 的 AI 应用。',
  通义千问: '面向工作与学习场景的智能助手。',
}
const tags = {
  GitHub: ['开发', '开源'], Figma: ['设计'], Notion: ['效率'], ChatGPT: ['AI'],
  'MDN Web Docs': ['开发', '文档'], Vercel: ['开发'], 'Tailwind CSS': ['开发', 'CSS'],
  Linear: ['效率'], Dribbble: ['设计'], Cloudflare: ['开发'], 'Google AI Studio': ['AI'],
  通义千问: ['AI'],
}
const requested = new URLSearchParams(location.search).get('columns')
const layout = ['2', '3'].includes(requested) ? `columns-${requested}` : 'list'
const grid = document.getElementById('bookmark-grid')
grid.className = `bookmark-grid ${layout === 'list' ? 'layout-list' : `layout-grid ${layout}`}`
document.querySelectorAll('.bookmark-card').forEach((card) => {
  const title = card.querySelector('.bookmark-title').textContent
  const description = document.createElement('p')
  description.className = 'card-description'
  description.textContent = descriptions[title]
  const tagList = document.createElement('div')
  tagList.className = 'card-tags'
  tags[title].forEach((tag) => {
    const node = document.createElement('span')
    node.className = 'tag'
    node.textContent = tag
    tagList.append(node)
  })
  card.append(description, tagList)
  if (layout === 'list') {
    const heading = document.createElement('div')
    heading.className = 'card-heading'
    heading.append(card.querySelector('.favicon-wrap'), card.querySelector('.bookmark-title'))
    card.prepend(heading)
  }
})
