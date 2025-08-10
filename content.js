console.log('Content script loaded for:', window.location.href);

// Readability library (bundled to avoid CSP issues)
// This is a simplified version of Mozilla's Readability library
class SimpleReadability {
  constructor(doc) {
    this._doc = doc;
    this._articleTitle = null;
    this._articleContent = null;
    this._articleExcerpt = null;
    this._articleSiteName = null;
    this._articleByline = null;
  }

  parse() {
    try {
      this._articleTitle = this._getArticleTitle();
      this._articleContent = this._getArticleContent();
      this._articleExcerpt = this._getArticleExcerpt();
      this._articleSiteName = this._getSiteName();
      this._articleByline = this._getByline();
      
      return {
        title: this._articleTitle,
        content: this._articleContent,
        textContent: this._articleContent,
        excerpt: this._articleExcerpt,
        siteName: this._articleSiteName,
        byline: this._articleByline,
        length: this._articleContent ? this._articleContent.length : 0
      };
    } catch (error) {
      console.error('Error in SimpleReadability:', error);
      return {
        title: this._doc.title || 'Untitled',
        content: this._doc.body ? this._doc.body.textContent : '',
        textContent: this._doc.body ? this._doc.body.textContent : '',
        excerpt: '',
        siteName: '',
        byline: '',
        length: 0
      };
    }
  }

  _getArticleTitle() {
    // Try to find the most relevant title
    const titleSelectors = [
      'h1[class*="title"]',
      'h1[class*="headline"]',
      'h1[class*="article"]',
      'h1',
      '[class*="title"]',
      '[class*="headline"]',
      'title'
    ];
    
    for (const selector of titleSelectors) {
      const element = this._doc.querySelector(selector);
      if (element && element.textContent.trim()) {
        return element.textContent.trim();
      }
    }
    
    return this._doc.title || 'Untitled';
  }

  _getArticleContent() {
    // Try to find main content area
    const contentSelectors = [
      'main',
      'article',
      '[role="main"]',
      '.content',
      '.main',
      '#content',
      '#main',
      '.post',
      '.entry',
      '.article',
      '.story'
    ];
    
    let mainElement = null;
    let maxLength = 0;
    
    for (const selector of contentSelectors) {
      const elements = this._doc.querySelectorAll(selector);
      for (const element of elements) {
        const textLength = element.textContent.trim().length;
        if (textLength > maxLength && textLength > 100) {
          maxLength = textLength;
          mainElement = element;
        }
      }
    }
    
    if (mainElement) {
      return this._cleanText(mainElement.textContent);
    }
    
    // Fallback: find the longest text block
    const paragraphs = this._doc.querySelectorAll('p');
    let longestText = '';
    
    for (const p of paragraphs) {
      const text = p.textContent.trim();
      if (text.length > longestText.length && text.length > 100) {
        longestText = text;
      }
    }
    
    if (longestText.length > 200) {
      return longestText;
    }
    
    // Last resort: use body text but clean it
    return this._cleanText(this._doc.body.textContent);
  }

  _cleanText(text) {
    return text
      .replace(/\s+/g, ' ')
      .replace(/menu|navigation|nav|footer|header|sidebar|advertisement|ads/gi, '')
      .trim();
  }

  _getArticleExcerpt() {
    // Try to find meta description or first paragraph
    const metaDesc = this._doc.querySelector('meta[name="description"]');
    if (metaDesc && metaDesc.content) {
      return metaDesc.content.trim();
    }
    
    const firstP = this._doc.querySelector('p');
    if (firstP && firstP.textContent.trim().length > 50) {
      return firstP.textContent.trim().substring(0, 200) + '...';
    }
    
    return '';
  }

  _getSiteName() {
    // Try to find site name from various sources
    const metaSiteName = this._doc.querySelector('meta[property="og:site_name"]');
    if (metaSiteName && metaSiteName.content) {
      return metaSiteName.content.trim();
    }
    
    const logo = this._doc.querySelector('[class*="logo"], [class*="brand"]');
    if (logo && logo.textContent.trim()) {
      return logo.textContent.trim();
    }
    
    return '';
  }

  _getByline() {
    // Try to find author information
    const authorSelectors = [
      '[class*="author"]',
      '[class*="byline"]',
      '[rel="author"]',
      '.author',
      '.byline'
    ];
    
    for (const selector of authorSelectors) {
      const element = this._doc.querySelector(selector);
      if (element && element.textContent.trim()) {
        return element.textContent.trim();
      }
    }
    
    return '';
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Message received in content script:', request);
  
  if (request.action === "scrapeContent") {
    handleScrapeContent(sendResponse);
    return true; // Required to indicate we'll send response asynchronously
  }
});

async function handleScrapeContent(sendResponse) {
  try {
    console.log('Starting content scraping with SimpleReadability...');
    
    // Use our bundled SimpleReadability
    const reader = new SimpleReadability(document);
    const article = reader.parse();
    
    console.log('SimpleReadability parsing completed:', {
      title: article.title,
      textContent: article.textContent?.length || 0,
      excerpt: article.excerpt?.length || 0
    });
    
    // Extract additional metadata
    const metaTags = extractMetaTags();
    const images = extractImages();
    const links = extractLinks();
    const headings = extractHeadings();
    const paragraphs = extractParagraphs();
    
    const pageContent = {
      title: article.title || document.title || 'Untitled Page',
      url: window.location.href,
      text: article.textContent || article.content || document.body.textContent,
      textLength: (article.textContent || article.content || document.body.textContent).length,
      excerpt: article.excerpt || '',
      siteName: article.siteName || '',
      byline: article.byline || '',
      links: links,
      headings: headings,
      images: images,
      paragraphs: paragraphs,
      metaTags: metaTags,
      timestamp: new Date().toISOString(),
      readabilityScore: article.length || 0
    };
    
    console.log('Content scraping completed successfully:', {
      title: pageContent.title,
      textLength: pageContent.textLength,
      links: pageContent.links.length,
      headings: pageContent.headings.length,
      images: pageContent.images.length,
      paragraphs: pageContent.paragraphs.length,
      metaTags: pageContent.metaTags.length,
      readabilityScore: pageContent.readabilityScore
    });
    
    sendResponse({ success: true, data: pageContent });
    
  } catch (error) {
    console.error('Error scraping content:', error);
    sendResponse({ 
      success: false, 
      error: error.message,
      stack: error.stack 
    });
  }
}

function extractMetaTags() {
  const metaTags = [];
  document.querySelectorAll('meta').forEach(meta => {
    if (meta.name && meta.content) {
      metaTags.push({ name: meta.name, content: meta.content });
    }
    if (meta.property && meta.content) {
      metaTags.push({ property: meta.property, content: meta.content });
    }
  });
  return metaTags;
}

function extractImages() {
  return Array.from(document.querySelectorAll('img'))
    .map(img => ({
      src: img.src,
      alt: img.alt || '',
      title: img.title || '',
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height
    }))
    .filter(img => img.src && img.src.length > 0);
}

function extractLinks() {
  return Array.from(document.links)
    .map(link => ({
      text: link.innerText.trim(),
      href: link.href,
      title: link.title || '',
      rel: link.rel || ''
    }))
    .filter(link => 
      link.text && 
      link.text.length > 0 && 
      link.href && 
      !link.href.startsWith('javascript:') &&
      !link.href.startsWith('mailto:') &&
      !link.href.startsWith('tel:')
    );
}

function extractHeadings() {
  return Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))
    .map(h => ({
      level: parseInt(h.tagName.charAt(1)),
      text: h.innerText.trim(),
      id: h.id || ''
    }))
    .filter(h => h.text.length > 0);
}

function extractParagraphs() {
  return Array.from(document.querySelectorAll('p'))
    .map(p => p.textContent.trim())
    .filter(text => text.length > 50);
}