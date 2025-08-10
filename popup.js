// ===== GLOBAL VARIABLES =====
let currentTab = null;
let pageData = null;
let downloadButton = null;
let conversationHistory = [];

// ===== DOM ELEMENTS =====
const elements = {
  apiKeyInput: null,
  saveKeyBtn: null,
  chatContainer: null,
  chatInput: null,
  sendBtn: null,
  downloadBtn: null,
  downloadConversationBtn: null,
  currentUrl: null,
  currentTitle: null,
  contentLength: null,
  linksCount: null,
  headingsCount: null,
  imagesCount: null,
  contentStats: null
};

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
  initializeElements();
  initializeEventListeners();
  initializeExtension();
});

function initializeElements() {
  elements.apiKeyInput = document.getElementById('api-key');
  elements.saveKeyBtn = document.getElementById('save-api-key');
  elements.chatContainer = document.getElementById('chat-container');
  elements.chatInput = document.getElementById('message-input');
  elements.sendBtn = document.getElementById('send-btn');
  elements.downloadBtn = document.getElementById('download-btn');
  elements.downloadConversationBtn = document.getElementById('download-conversation-btn');
  elements.currentTitle = document.getElementById('current-title');
  elements.textLength = document.getElementById('text-length');
  elements.linksCount = document.getElementById('links-count');
  elements.headingsCount = document.getElementById('headings-count');
  elements.imagesCount = document.getElementById('images-count');
  elements.contentStats = document.getElementById('content-stats');
  elements.pageInfo = document.getElementById('page-info');
  elements.statsToggle = document.getElementById('stats-toggle');
  elements.statsContent = document.getElementById('stats-content');
  
  downloadButton = elements.downloadBtn;
}

function initializeEventListeners() {
  elements.saveKeyBtn.addEventListener('click', saveApiKey);
  elements.sendBtn.addEventListener('click', sendMessage);
  elements.chatInput.addEventListener('keypress', handleKeyPress);
  elements.downloadBtn.addEventListener('click', downloadMarkdown);
  elements.downloadConversationBtn.addEventListener('click', downloadConversation);
  elements.statsToggle.addEventListener('click', toggleStats);
  
  // Load saved API key
  chrome.storage.local.get(['apiKey'], (result) => {
    if (result.apiKey) {
      elements.apiKeyInput.value = result.apiKey;
    }
  });
}

// ===== EXTENSION INITIALIZATION =====
async function initializeExtension() {
  try {
    console.log('Initializing extension...');
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tabs[0];
    
    if (!currentTab) {
      throw new Error('No active tab found');
    }
    
    console.log('Active tab:', currentTab);
    elements.currentTitle.textContent = currentTab.title;
    
    // Check if we're on a supported page
    if (currentTab.url.startsWith('chrome://') || currentTab.url.startsWith('chrome-extension://') || 
        currentTab.url.startsWith('edge://') || currentTab.url.startsWith('about:')) {
      throw new Error('This extension cannot run on browser settings pages. Please navigate to a regular website.');
    }
    
    // Scrape page content
    console.log('Sending scrapeContent message to tab:', currentTab.id);
    
    try {
      const response = await chrome.tabs.sendMessage(currentTab.id, { action: 'scrapeContent' });
      console.log('Received response:', response);
      
      if (response && response.success) {
        pageData = response.data;
        console.log('Page data loaded successfully with SimpleReadability:', pageData);
        updateContentStats();
        elements.contentStats.classList.remove('d-none');
        
            // Show page info and download button
        elements.pageInfo.classList.remove('d-none');
        elements.downloadBtn.classList.remove('d-none');
    
        // Show success message with content extraction info
        const message = pageData.readabilityScore > 0 
          ? `Page content extracted successfully! (Content length: ${pageData.textLength.toLocaleString()} chars)`
          : 'Page content loaded successfully! You can now ask questions about the page.';
        addMessage(message, 'success');
      } else {
        throw new Error(response?.error || 'Failed to scrape page content');
      }
    } catch (messageError) {
      console.error('Error communicating with content script:', messageError);
      
      // Try to inject the content script manually if it's not loaded
      if (messageError.message.includes('Receiving end does not exist')) {
        console.log('Attempting to inject content script manually...');
        try {
          await chrome.scripting.executeScript({
            target: { tabId: currentTab.id },
            files: ['content.js']
          });
          
          // Wait a moment for the script to load
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Try scraping again
          const retryResponse = await chrome.tabs.sendMessage(currentTab.id, { action: 'scrapeContent' });
          if (retryResponse && retryResponse.success) {
            pageData = retryResponse.data;
            console.log('Page data loaded successfully after manual injection with SimpleReadability:', pageData);
            updateContentStats();
            elements.contentStats.classList.remove('d-none');
            elements.pageInfo.classList.remove('d-none');
            elements.downloadBtn.classList.remove('d-none');
            
            const message = pageData.readabilityScore > 0 
              ? `Page content extracted successfully! (Content length: ${pageData.textLength.toLocaleString()} chars)`
              : 'Page content loaded successfully! You can now ask questions about the page.';
            addMessage(message, 'success');
          } else {
            throw new Error('Failed to scrape content even after manual script injection');
          }
        } catch (injectionError) {
          console.error('Failed to inject content script:', injectionError);
          throw new Error('Unable to load content script. Please refresh the page and try again.');
        }
      } else {
        throw messageError;
      }
    }
  } catch (error) {
    console.error('Error initializing extension:', error);
    
    if (error.message.includes('Receiving end does not exist')) {
      addMessage('Content script not loaded. Please refresh the page and try again.', 'error');
    } else if (error.message.includes('browser settings pages')) {
      addMessage(error.message, 'error');
    } else {
      addMessage(`Error: ${error.message}`, 'error');
    }
  }
}

// ===== CONTENT STATISTICS =====
function updateContentStats() {
  if (!pageData) return;
  
  elements.textLength.textContent = pageData.textLength.toLocaleString();
  elements.linksCount.textContent = pageData.links.length;
  elements.headingsCount.textContent = pageData.headings.length;
  elements.imagesCount.textContent = pageData.images.length;
  
  // Start with stats collapsed by default
  elements.statsContent.classList.add('collapsed');
}

// ===== API KEY MANAGEMENT =====
function saveApiKey() {
  const apiKey = elements.apiKeyInput.value.trim();
  if (apiKey) {
    chrome.storage.local.set({ apiKey }, () => {
      addMessage('API key saved successfully!', 'success');
    });
  }
}

// ===== MESSAGE HANDLING =====
function addMessage(text, type = 'user', isAI = false) {
  // Add to conversation history
  conversationHistory.push({
    text: text,
    type: type,
    isAI: isAI,
    timestamp: new Date().toISOString()
  });
  
  // Show download conversation button if we have conversations
  if (conversationHistory.length > 0) {
    elements.downloadConversationBtn.style.display = 'inline-block';
  }
  
  // Remove empty state if it exists
  const emptyState = elements.chatContainer.querySelector('.empty-state');
  if (emptyState) {
    emptyState.remove();
  }
  
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${type} ${isAI ? 'ai' : 'user'}`;
  
  const messageBubble = document.createElement('div');
  messageBubble.className = 'message-bubble';
  
  if (isAI) {
    // Convert markdown to HTML for AI messages in chat history
    try {
      console.log('Processing AI message:', text);
      const htmlContent = convertMarkdownToHtml(text);
      console.log('Converted HTML:', htmlContent);
      messageBubble.innerHTML = htmlContent;
      
      // Add markdown controls
      addMarkdownControls(messageBubble, text);
    } catch (error) {
      console.error('Error converting markdown:', error);
      messageBubble.textContent = text;
    }
  } else {
    messageBubble.textContent = text;
  }
  
  messageDiv.appendChild(messageBubble);
  elements.chatContainer.appendChild(messageDiv);
  elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
}

function getBootstrapAlertClass(type, isAI) {
  if (type === 'error') return 'alert-danger';
  if (type === 'success') return 'alert-success';
  if (isAI) return 'alert-info';
  return 'alert-primary';
}

function addMarkdownControls(messageDiv, originalText) {
  const controlsDiv = document.createElement('div');
  controlsDiv.className = 'markdown-controls';
  
  // Copy button
  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn btn-sm btn-outline-primary';
  copyBtn.innerHTML = '<i class="bi bi-clipboard"></i>';
  copyBtn.title = 'Copy Markdown';
  copyBtn.onclick = () => copyToClipboard(originalText);
  
  controlsDiv.appendChild(copyBtn);
  messageDiv.appendChild(controlsDiv);
}



async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    addMessage('Markdown copied to clipboard!', 'success');
  } catch (error) {
    console.error('Failed to copy:', error);
    addMessage('Failed to copy to clipboard', 'error');
  }
}

// ===== MARKDOWN TO HTML CONVERSION =====
function convertMarkdownToHtml(markdown) {
  console.log('Converting markdown to HTML:', markdown);
  
  let html = markdown;
  
  // Code blocks
  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  
  // Headers
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
  
  // Bold and italic
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // Lists
  html = html.replace(/^\* (.*$)/gim, '<li>$1</li>');
  html = html.replace(/^- (.*$)/gim, '<li>$1</li>');
  html = html.replace(/^\d+\. (.*$)/gim, '<li>$1</li>');
  
  // Wrap lists in ul/ol
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
  
  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  
  // Paragraphs and line breaks
  html = html.replace(/\n\n/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');
  
  // Wrap in paragraph tags if not already wrapped
  if (!html.startsWith('<')) {
    html = '<p>' + html + '</p>';
  }
  
  console.log('Converted HTML:', html);
  return html;
}

// ===== USER INPUT HANDLING =====
function handleKeyPress(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    sendMessage();
  }
}

async function sendMessage() {
  const message = elements.chatInput.value.trim();
  if (!message) return;
  
  // Clear input
  elements.chatInput.value = '';
  
  // Add user message
  addMessage(message, 'user');
  
  // Check if API key is set
  const apiKey = elements.apiKeyInput.value.trim();
  if (!apiKey) {
    addMessage('Please enter your Gemini API key first.', 'error');
    return;
  }
  
  // Show thinking indicator
  addThinkingIndicator();
  
  try {
    await queryAI(message, apiKey);
    // Remove thinking indicator
    removeThinkingIndicator();
  } catch (error) {
    console.error('Error querying AI:', error);
    addMessage('Error: ' + error.message, 'error');
    // Remove thinking indicator
    removeThinkingIndicator();
  }
}

function addThinkingIndicator() {
  const thinkingDiv = document.createElement('div');
  thinkingDiv.className = 'message ai thinking';
  thinkingDiv.id = 'thinking-indicator';
  
  const thinkingBubble = document.createElement('div');
  thinkingBubble.className = 'message-bubble';
  
  const thinkingContent = document.createElement('div');
  thinkingContent.className = 'thinking-indicator';
  thinkingContent.innerHTML = '<div class="spinner"></div> Analyzing page content...';
  
  thinkingBubble.appendChild(thinkingContent);
  thinkingDiv.appendChild(thinkingBubble);
  elements.chatContainer.appendChild(thinkingDiv);
  elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
}

function removeThinkingIndicator() {
  const thinkingIndicator = document.getElementById('thinking-indicator');
  if (thinkingIndicator) {
    thinkingIndicator.remove();
  }
}

function toggleStats() {
  const isExpanded = elements.statsContent.classList.contains('expanded');
  const toggleIcon = elements.statsToggle.querySelector('i');
  
  if (isExpanded) {
    elements.statsContent.classList.remove('expanded');
    elements.statsContent.classList.add('collapsed');
    toggleIcon.classList.add('rotated');
  } else {
    elements.statsContent.classList.remove('collapsed');
    elements.statsContent.classList.add('expanded');
    toggleIcon.classList.remove('rotated');
  }
}



// ===== AI QUERY =====
async function queryAI(userMessage, apiKey) {
  if (!pageData) {
    throw new Error('No page data available. Please refresh the page.');
  }
  
  const prompt = `You are analyzing a web page. Here's the page information:
  
Title: ${pageData.title}
URL: ${pageData.url}
Content Length: ${pageData.textLength.toLocaleString()} characters
Number of Links: ${pageData.links.length}
Number of Headings: ${pageData.headings.length}
Number of Images: ${pageData.images.length}
Number of Paragraphs: ${pageData.paragraphs.length}

IMPORTANT: Focus on analyzing the actual text content and answering the user's question. Do not focus on metadata like character counts, link counts, or page statistics unless specifically asked. Instead, use the main content to provide meaningful answers.

Main Content:
${pageData.text}

User Question: ${userMessage}

ALWAYS format your response in Markdown format with proper headings, lists, and formatting.`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: prompt
        }]
      }]
    })
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  const data = await response.json();
  console.log('AI API response:', data);
  
  if (data.candidates && data.candidates[0] && data.candidates[0].content) {
    const aiResponse = data.candidates[0].content.parts[0].text;
    console.log('AI response text:', aiResponse);
    addMessage(aiResponse, 'ai', true);
  } else {
    console.error('Invalid response structure:', data);
    throw new Error('Invalid response from AI service');
  }
}

// ===== MARKDOWN DOWNLOAD =====
function generateMarkdownContent() {
  if (!pageData) return '';
  
  const timestamp = new Date().toLocaleString();
  
  let markdown = `# ${pageData.title}\n\n`;
  
  // Add Readability metadata if available
  if (pageData.readabilityScore > 0) {
    markdown += `**Readability Score:** ${pageData.readabilityScore}\n`;
  }
  if (pageData.siteName) {
    markdown += `**Site:** ${pageData.siteName}\n`;
  }
  if (pageData.byline) {
    markdown += `**By:** ${pageData.byline}\n`;
  }
  if (pageData.excerpt) {
    markdown += `**Excerpt:** ${pageData.excerpt}\n`;
  }
  
  markdown += `\n**URL:** [${pageData.url}](${pageData.url})
**Content Length:** ${pageData.textLength.toLocaleString()} characters
**Scraped:** ${timestamp}

## Page Statistics
- **Links:** ${pageData.links.length}
- **Headings:** ${pageData.headings.length}
- **Images:** ${pageData.images.length}
- **Paragraphs:** ${pageData.paragraphs.length}

## Meta Information
${pageData.metaTags.map(tag => `- **${tag.name || tag.property}:** ${tag.content}`).join('\n')}

## Headings Structure
${pageData.headings.map(heading => `${'#'.repeat(heading.level)} ${heading.text}`).join('\n')}

## Images
${pageData.images.map(img => `- **${img.alt || 'No alt text'}** (${img.title || 'No title'}) - ${img.width}x${img.height}`).join('\n')}

## Links
${pageData.links.map(link => `- [${link.text}](${link.href}) - ${link.title || 'No title'}`).join('\n')}

## Key Paragraphs
${pageData.paragraphs.map(p => `> ${p}`).join('\n\n')}

## Full Content
${pageData.text}`;

  return markdown;
}

async function downloadMarkdown() {
  try {
    const markdownContent = generateMarkdownContent();
    const blob = new Blob([markdownContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pageData.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_content.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    addMessage('✅ Markdown file downloaded successfully!', 'success');
  } catch (error) {
    console.error('Download error:', error);
    addMessage('❌ Failed to download markdown file', 'error');
  }
}

// ===== CONVERSATION DOWNLOAD =====
function generateConversationMarkdown() {
  if (!pageData || conversationHistory.length === 0) return '';
  
  const timestamp = new Date().toLocaleString();
  
  let markdown = `# Chat Conversation: ${pageData.title}\n\n`;
  
  // Add page context
  markdown += `**Page:** ${pageData.title}\n`;
  markdown += `**URL:** [${pageData.url}](${pageData.url})\n`;
  markdown += `**Conversation Date:** ${timestamp}\n\n`;
  
  // Add conversation history
  markdown += `## Conversation History\n\n`;
  
  conversationHistory.forEach((message, index) => {
    const time = new Date(message.timestamp).toLocaleTimeString();
    const role = message.isAI ? 'AI Assistant' : 'User';
    
    markdown += `### ${role} (${time})\n\n`;
    markdown += `${message.text}\n\n`;
    
    // Add separator between messages
    if (index < conversationHistory.length - 1) {
      markdown += `---\n\n`;
    }
  });
  
  // Add page summary if available
  if (pageData.excerpt) {
    markdown += `## Page Summary\n\n`;
    markdown += `${pageData.excerpt}\n\n`;
  }
  
  // Add content statistics
  markdown += `## Page Statistics\n\n`;
  markdown += `- **Content Length:** ${pageData.textLength.toLocaleString()} characters\n`;
  markdown += `- **Links:** ${pageData.links.length}\n`;
  markdown += `- **Headings:** ${pageData.headings.length}\n`;
  markdown += `- **Images:** ${pageData.images.length}\n`;
  markdown += `- **Paragraphs:** ${pageData.paragraphs.length}\n`;
  
  return markdown;
}

async function downloadConversation() {
  try {
    if (conversationHistory.length === 0) {
      addMessage('❌ No conversation to download', 'error');
      return;
    }
    
    const markdownContent = generateConversationMarkdown();
    const blob = new Blob([markdownContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pageData.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_conversation.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    addMessage('✅ Conversation downloaded successfully!', 'success');
  } catch (error) {
    console.error('Conversation download error:', error);
    addMessage('❌ Failed to download conversation', 'error');
  }
}
