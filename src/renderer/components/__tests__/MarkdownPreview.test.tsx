import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { App } from 'antd'
import MarkdownPreview from '../MarkdownPreview'

// Mock CSS imports
vi.mock('katex/dist/katex.min.css', () => ({}))
vi.mock('prismjs/themes/prism.css', () => ({}))
vi.mock('../../styles/markdown.css', () => ({}))

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>
    <App>{children}</App>
  </BrowserRouter>
)

describe('MarkdownPreview', () => {
  afterEach(() => {
    cleanup()
  })

  describe('Basic Rendering', () => {
    it('should render without crashing', () => {
      render(
        <Wrapper>
          <MarkdownPreview content="" />
        </Wrapper>
      )

      expect(document.querySelector('.markdown-preview')).toBeInTheDocument()
    })

    it('should render empty content', () => {
      render(
        <Wrapper>
          <MarkdownPreview content="" />
        </Wrapper>
      )

      const preview = document.querySelector('.markdown-preview')
      expect(preview).toBeInTheDocument()
    })

    it('should have correct container styling', () => {
      render(
        <Wrapper>
          <MarkdownPreview content="Test content" />
        </Wrapper>
      )

      const preview = document.querySelector('.markdown-preview')
      expect(preview).toHaveStyle({ padding: '24px' })
      expect(preview).toHaveStyle({ backgroundColor: '#fffbe6' })
    })
  })

  describe('Markdown Rendering', () => {
    it('should render plain text', () => {
      render(
        <Wrapper>
          <MarkdownPreview content="Hello World" />
        </Wrapper>
      )

      expect(screen.getByText('Hello World')).toBeInTheDocument()
    })

    it('should render heading', () => {
      render(
        <Wrapper>
          <MarkdownPreview content="# Heading 1" />
        </Wrapper>
      )

      const heading = screen.getByRole('heading', { level: 1 })
      expect(heading).toBeInTheDocument()
      expect(heading).toHaveTextContent('Heading 1')
    })

    it('should render multiple headings', () => {
      render(
        <Wrapper>
          <MarkdownPreview content="# H1\n## H2\n### H3" />
        </Wrapper>
      )

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('H1')
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('H2')
      expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('H3')
    })

    it('should render paragraphs', () => {
      render(
        <Wrapper>
          <MarkdownPreview content="First paragraph\n\nSecond paragraph" />
        </Wrapper>
      )

      expect(screen.getByText('First paragraph')).toBeInTheDocument()
      expect(screen.getByText('Second paragraph')).toBeInTheDocument()
    })

    it('should render bold text', () => {
      render(
        <Wrapper>
          <MarkdownPreview content="This is **bold** text" />
        </Wrapper>
      )

      const bold = document.querySelector('strong')
      expect(bold).toBeInTheDocument()
      expect(bold).toHaveTextContent('bold')
    })

    it('should render italic text', () => {
      render(
        <Wrapper>
          <MarkdownPreview content="This is *italic* text" />
        </Wrapper>
      )

      const italic = document.querySelector('em')
      expect(italic).toBeInTheDocument()
      expect(italic).toHaveTextContent('italic')
    })

    it('should render links', () => {
      render(
        <Wrapper>
          <MarkdownPreview content="[Link text](https://example.com)" />
        </Wrapper>
      )

      const link = screen.getByRole('link', { name: 'Link text' })
      expect(link).toBeInTheDocument()
      expect(link).toHaveAttribute('href', 'https://example.com')
    })

    it('should render unordered lists', () => {
      render(
        <Wrapper>
          <MarkdownPreview content="- Item 1\n- Item 2\n- Item 3" />
        </Wrapper>
      )

      const list = document.querySelector('ul')
      expect(list).toBeInTheDocument()

      const items = document.querySelectorAll('li')
      expect(items).toHaveLength(3)
    })

    it('should render ordered lists', () => {
      render(
        <Wrapper>
          <MarkdownPreview content="1. First\n2. Second\n3. Third" />
        </Wrapper>
      )

      const list = document.querySelector('ol')
      expect(list).toBeInTheDocument()
    })

    it('should render inline code', () => {
      render(
        <Wrapper>
          <MarkdownPreview content="Use `console.log()` for debugging" />
        </Wrapper>
      )

      const code = document.querySelector('code')
      expect(code).toBeInTheDocument()
      expect(code).toHaveTextContent('console.log()')
    })

    it('should render code blocks', () => {
      render(
        <Wrapper>
          <MarkdownPreview content="```javascript\nconst x = 1;\n```" />
        </Wrapper>
      )

      const pre = document.querySelector('pre')
      expect(pre).toBeInTheDocument()
    })

    it('should render blockquotes', () => {
      render(
        <Wrapper>
          <MarkdownPreview content="> This is a quote" />
        </Wrapper>
      )

      const blockquote = document.querySelector('blockquote')
      expect(blockquote).toBeInTheDocument()
      expect(blockquote).toHaveTextContent('This is a quote')
    })
  })

  describe('GFM Support', () => {
    it('should render tables', () => {
      const tableContent = `
| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |
`
      render(
        <Wrapper>
          <MarkdownPreview content={tableContent} />
        </Wrapper>
      )

      const table = document.querySelector('table')
      expect(table).toBeInTheDocument()
    })

    it('should render strikethrough', () => {
      render(
        <Wrapper>
          <MarkdownPreview content="~~strikethrough~~" />
        </Wrapper>
      )

      const del = document.querySelector('del')
      expect(del).toBeInTheDocument()
      expect(del).toHaveTextContent('strikethrough')
    })

    it('should render task lists', () => {
      render(
        <Wrapper>
          <MarkdownPreview content="- [ ] Unchecked\n- [x] Checked" />
        </Wrapper>
      )

      const inputs = document.querySelectorAll('input[type="checkbox"]')
      expect(inputs).toHaveLength(2)
    })
  })

  describe('KaTeX Math Support', () => {
    it('should render inline math', () => {
      render(
        <Wrapper>
          <MarkdownPreview content="Inline math: $E = mc^2$" />
        </Wrapper>
      )

      // KaTeX renders math in spans with katex class
      const katexElement = document.querySelector('.katex')
      expect(katexElement).toBeInTheDocument()
    })

    it('should render block math', () => {
      render(
        <Wrapper>
          <MarkdownPreview content="$$\nE = mc^2\n$$" />
        </Wrapper>
      )

      const katexElement = document.querySelector('.katex-display')
      expect(katexElement).toBeInTheDocument()
    })
  })

  describe('Content Updates', () => {
    it('should update when content prop changes', () => {
      const { rerender } = render(
        <Wrapper>
          <MarkdownPreview content="Initial content" />
        </Wrapper>
      )

      expect(screen.getByText('Initial content')).toBeInTheDocument()

      rerender(
        <Wrapper>
          <MarkdownPreview content="Updated content" />
        </Wrapper>
      )

      expect(screen.getByText('Updated content')).toBeInTheDocument()
      expect(screen.queryByText('Initial content')).not.toBeInTheDocument()
    })
  })

  describe('Complex Content', () => {
    it('should render mixed content correctly', () => {
      const mixedContent = `
# Title

This is a **bold** paragraph with *italic* and \`code\`.

- List item 1
- List item 2

> A quote

\`\`\`python
print("Hello")
\`\`\`
`
      render(
        <Wrapper>
          <MarkdownPreview content={mixedContent} />
        </Wrapper>
      )

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Title')
      expect(document.querySelector('strong')).toBeInTheDocument()
      expect(document.querySelector('em')).toBeInTheDocument()
      expect(document.querySelector('ul')).toBeInTheDocument()
      expect(document.querySelector('blockquote')).toBeInTheDocument()
      expect(document.querySelector('pre')).toBeInTheDocument()
    })
  })
})
