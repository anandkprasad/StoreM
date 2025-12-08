// Key fixes for your server.js

// 1. FIX: Missing DROPBOX_ACCESS_TOKEN constant
const DROPBOX_ACCESS_TOKEN = process.env.DROPBOX_ACCESS_TOKEN;

// 2. FIX: Admin add route - Always set isDigital to true and validate PDF
app.post('/admin/add', isLoggedIn, isAdmin, upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'pdf', maxCount: 1 }
]), async function(req, res) {
  var name = req.body.name;
  var description = req.body.description;
  var price = req.body.price;
  var isDigital = true; // ALWAYS TRUE - all products are digital
  var imageUrl = '';
  var pdfUrl = '';
  var pageImages = [];

  // VALIDATE: PDF is required
  if (!req.files || !req.files.pdf || req.files.pdf.length === 0) {
    if (req.flash) {
      req.flash('error', 'PDF file is required for digital products');
    }
    return res.redirect('/admin/add');
  }

  // TRUNCATE description for Razorpay compatibility (255 char limit)
  if (description && description.length > 255) {
    description = description.substring(0, 252) + '...';
  }

  // Process files
  const processImage = async () => {
    if (req.files && req.files.image && req.files.image[0]) {
      return new Promise((resolve, reject) => {
        var imageFile = req.files.image[0];
        var imageStream = cloudinary.uploader.upload_stream(
          { folder: 'store-items' },
          async function(error, result) {
            if (error) {
              return reject(error);
            }
            imageUrl = result.secure_url;
            resolve();
          }
        );
        imageStream.end(imageFile.buffer);
      });
    }
    return Promise.resolve();
  };

  // Process PDF - Upload to Dropbox
  const processPDF = async (itemId) => {
    if (req.files && req.files.pdf && req.files.pdf[0]) {
      try {
        const pdfFile = req.files.pdf[0];
        const tempPath = path.join(os.tmpdir(), `pdf_${itemId}_${Date.now()}.pdf`);
        fs.writeFileSync(tempPath, pdfFile.buffer);
        
        const dropboxPath = `/store-pdfs/${itemId}.pdf`;
        const dbx = await getDropboxInstance();
        
        // Upload to Dropbox
        await dbx.filesUpload({
          path: dropboxPath,
          contents: fs.readFileSync(tempPath),
          mode: 'overwrite',
          autorename: false,
          mute: false,
        });
        
        // Create shared link
        const linkResp = await dbx.sharingCreateSharedLinkWithSettings({ 
          path: dropboxPath 
        });
        
        if (linkResp && linkResp.result && linkResp.result.url) {
          // Convert to raw/download link
          pdfUrl = linkResp.result.url.replace('?dl=0', '?raw=1');
        } else {
          throw new Error('Dropbox shared link response missing url');
        }
        
        // Clean up temp file
        fs.unlinkSync(tempPath);
        pageImages = [];
      } catch (pdfError) {
        console.error('PDF processing error:', pdfError);
        throw pdfError;
      }
    }
  };

  try {
    // First, create temp item to get ID
    var tempItem = new Item({
      name: name,
      description: description,
      price: parseFloat(price),
      image_url: '',
      is_digital: true, // ALWAYS TRUE
      pdf_url: '',
      page_images: []
    });
    await tempItem.save();
    const itemId = tempItem._id.toString();

    // Upload image
    await processImage();

    // Process PDF (required)
    await processPDF(itemId);

    // Update item with all URLs
    tempItem.image_url = imageUrl;
    tempItem.pdf_url = pdfUrl;
    tempItem.page_images = pageImages;
    await tempItem.save();

    if (req.flash) {
      req.flash('success', 'Digital product added successfully!');
    }
    res.redirect('/admin');
  } catch (err) {
    console.error('Error adding item:', err);
    if (req.flash) {
      req.flash('error', 'Error adding item: ' + err.message);
    }
    res.redirect('/admin/add');
  }
});

// 3. FIX: Payment route - Truncate description for Razorpay
app.get('/buy/:id', isLoggedIn, async function(req, res) {
  try {
    const product = await Item.findById(req.params.id);
    if (!product) {
      if (req.flash) {
        req.flash('error', 'Product not found');
      }
      return res.redirect('/');
    }
    
    // Truncate description for Razorpay (255 char limit)
    let description = product.description || 'Product purchase';
    if (description.length > 255) {
      description = description.substring(0, 252) + '...';
    }
    
    const amount = Math.round(product.price * 100); // Razorpay expects paise
    const options = {
      amount,
      currency: 'INR',
      receipt: 'order_rcptid_' + Date.now(),
      payment_capture: 1,
      notes: {
        product_id: product._id.toString(),
        product_name: product.name,
        description: description // Use truncated description
      }
    };
    const order = await razorpay.orders.create(options);
    
    // Pass truncated description to payment page
    res.render('payment', {
      orderId: order.id,
      amount: order.amount,
      key: process.env.RAZORPAY_KEY_ID || 'rzp_test_7XLmlaLyN7T96T',
      product: {
        ...product.toObject(),
        description: description // Use truncated version
      },
      user: req.user
    });
  } catch (err) {
    console.error('Razorpay error:', err);
    if (req.flash) {
      req.flash('error', 'Payment initiation failed');
    }
    res.redirect('/product/' + req.params.id);
  }
});

// 4. FIX: Remove duplicate route definition
// The route '/notes/:orderId/page/:pageNo/image' is defined twice in your code
// Keep only ONE version - here's the corrected one:

app.get('/notes/:orderId/page/:pageNo/image', async (req, res) => {
  try {
    const { orderId, pageNo } = req.params;
    console.log('[image] Route called:', { orderId, pageNo, hasSession: !!req.user, hasToken: !!req.query.token });

    // Validate token or session
    const token = req.query.token;
    let tokenData = null;
    if (token) {
      tokenData = validateViewToken(token);
      if (!tokenData) {
        console.warn('[image] Invalid token');
        return res.status(401).json({ error: 'token_invalid_or_expired' });
      }
      if (String(tokenData.orderId) !== String(orderId)) {
        console.warn('[image] Token/order mismatch');
        return res.status(403).json({ error: 'token_order_mismatch' });
      }
    } else {
      if (!req.user) {
        console.warn('[image] No session and no token');
        return res.status(401).json({ error: 'login_required' });
      }
    }

    // Find product
    let product = null;
    if (req.user && !tokenData) {
      // Session path
      await req.user.populate('orders.product');
      const order = req.user.orders.id(orderId);
      if (!order) {
        return res.status(404).json({ error: 'order_not_found' });
      }
      product = await Item.findById(order.product).lean();
    } else {
      // Token path
      const userWithOrder = await User.findOne({ 'orders._id': orderId })
        .populate('orders.product')
        .lean();
      if (!userWithOrder) {
        return res.status(404).json({ error: 'order_not_found' });
      }
      const theOrder = userWithOrder.orders.find(o => String(o._id) === String(orderId));
      if (!theOrder || !theOrder.product) {
        return res.status(404).json({ error: 'product_not_found' });
      }
      product = theOrder.product;
    }

    if (!product || !product.pdf_url) {
      return res.status(404).json({ error: 'pdf_source_missing' });
    }

    // Build local image path
    const pageIndex = Number(pageNo) || 1;
    const fileName = `page-${String(pageIndex).padStart(3, '0')}.jpg`;
    const localDir = path.join(__dirname, 'out-pages', String(product._id));
    const localPath = path.join(localDir, fileName);

    // If image doesn't exist, trigger conversion
    if (!fs.existsSync(localPath)) {
      console.log('[image] Page not found, triggering conversion:', localPath);
      await convertDropboxPdfToImagesLocal(product.pdf_url, Math.max(pageIndex, 10), product._id);
    }

    // Check again after conversion
    if (!fs.existsSync(localPath)) {
      console.warn('[image] Page image still not found after conversion:', localPath);
      return res.status(404).json({ error: 'page_image_not_found' });
    }

    const publicUrl = `/out-pages/${product._id}/${fileName}`;
    console.log('[image] Returning URL:', publicUrl);
    return res.json({ url: publicUrl });
  } catch (err) {
    console.error('[image] Error:', err);
    return res.status(500).json({ error: 'server_error', msg: String(err) });
  }
});

// 5. FIX: Ensure proper Dropbox token usage in /pdf/:id route
app.get('/pdf/:id', async (req, res) => {
  try {
    if (!req.user) return res.status(401).send('Login required');

    const raw = req.params.id || '';
    const base = raw.replace(/\.pdf$/i, '');
    const filename = base + '.pdf';
    const dropboxPath = `/store-pdfs/${filename}`;

    if (!/^[0-9a-fA-F]{24}$/.test(base)) {
      console.warn('[pdf proxy] Invalid product ObjectId:', base);
      return res.status(400).send('Invalid file id');
    }

    const userId = req.user._id;
    const user = await User.findById(userId).lean();
    if (!user) return res.status(401).send('User session invalid');

    const owns = (user.orders || []).some(o => {
      return String(o.product) === String(base);
    });

    if (!owns) {
      console.warn(`[pdf proxy] User ${userId} does not own product ${base}`);
      return res.status(403).send('Forbidden');
    }

    // Try SDK download first
    try {
      console.log('[pdf proxy] Attempting filesDownload for', dropboxPath);
      const dbx = await getDropboxInstance();
      const sdkResp = await dbx.filesDownload({ path: dropboxPath });
      const maybeBinary = sdkResp && (sdkResp.result ? sdkResp.result.fileBinary : sdkResp.fileBinary);
      if (maybeBinary) {
        const buffer = Buffer.isBuffer(maybeBinary) ? maybeBinary : Buffer.from(maybeBinary, 'binary');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Length', buffer.length);
        return res.send(buffer);
      }
      console.log('[pdf proxy] No binary, falling back to content API');
    } catch (sdkErr) {
      console.warn('[pdf proxy] filesDownload error:', sdkErr);
    }

    // Fallback: content API stream
    const dbx = await getDropboxInstance();
    const accessToken = await refreshDropboxToken(); // Get fresh token
    const apiUrl = 'https://content.dropboxapi.com/2/files/download';
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Dropbox-API-Arg': JSON.stringify({ path: dropboxPath })
      }
    });

    if (!resp.ok) {
      const bodyText = await resp.text().catch(()=>'<no-body>');
      console.error('[pdf proxy] Dropbox API error', resp.status, bodyText);
      if (resp.status === 409) return res.status(404).send('File not found');
      return res.status(502).send('Failed to retrieve file from Dropbox');
    }

    res.setHeader('Content-Type', resp.headers.get('content-type') || 'application/pdf');
    if (resp.headers.get('content-length')) {
      res.setHeader('Content-Length', resp.headers.get('content-length'));
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
    return resp.body.pipe(res);

  } catch (err) {
    console.error('[pdf proxy] Unexpected error:', err);
    return res.status(500).send('PDF proxy unexpected error');
  }
});

// EXPORT NOTE: Place these fixes in their respective locations in your server.js file