// AI Tool definitions — OpenAI function-calling format
// Each tool maps to one (or more) dashboard API endpoints

module.exports = [
  {
    type: 'function',
    function: {
      name: 'get_pending_orders',
      description: 'ดึงรายการ pending orders ของสาขา — ใช้ตอบ "order ค้างอยู่เท่าไหร่", "สาขานี้มี pending กี่ order"',
      parameters: {
        type: 'object',
        properties: {
          storeCode: {
            type: 'string',
            description: 'รหัสสาขา คั่นด้วย comma เช่น "1104" หรือ "1104,5022"'
          }
        },
        required: ['storeCode']
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'get_jobs',
      description: 'ดึงรายการ jobs (งานที่จ่ายให้ rider) — ใช้ตอบ "job วันนี้เป็นยังไง", "จ่ายงานไปกี่งาน", "rider คนนี้รับงานอะไร"',
      parameters: {
        type: 'object',
        properties: {
          storeCode: {
            type: 'string',
            description: 'รหัสสาขา คั่นด้วย comma'
          },
          from: {
            type: 'string',
            description: 'วันเริ่มต้น ISO format เช่น "2025-05-17T00:00:00.000Z" ถ้าไม่ระบุใช้เริ่มวันนี้'
          },
          to: {
            type: 'string',
            description: 'วันสิ้นสุด ISO format ถ้าไม่ระบุใช้สิ้นวันนี้'
          }
        },
        required: ['storeCode']
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'get_job_by_id',
      description: 'ค้นหา job จาก jobId โดยตรง — ใช้เมื่อ user ให้ jobId มาและต้องการรู้ว่า job นั้น: สถานะอะไร ใครรับงาน มี orderIds อะไรบ้าง สร้างเมื่อไหร่',
      parameters: {
        type: 'object',
        properties: {
          jobId:     { type: 'string', description: 'Job ID ที่ต้องการค้นหา' },
          storeCode: { type: 'string', description: 'รหัสสาขา' }
        },
        required: ['jobId', 'storeCode']
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'get_stuck_jobs',
      description: 'ดึง jobs ที่ค้าง/ไม่ได้รับการ assign — ใช้ตอบ "มี job ค้างไหม", "stuck job มีกี่อัน"',
      parameters: {
        type: 'object',
        properties: {
          storeCode: { type: 'string', description: 'รหัสสาขา' },
          from: { type: 'string', description: 'วันเริ่มต้น ISO format' },
          to:   { type: 'string', description: 'วันสิ้นสุด ISO format' }
        },
        required: ['storeCode']
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'get_order_detail',
      description: 'ดึงรายละเอียด order จากเลข consignment หรือ order ID — ไม่ต้องใช้วันที่ ค้นหาทุก order ในระบบ ใช้เมื่อ user ให้เลข CPTH, CKTH หรือ order ID มา ตอบ status, rider, payment, statusHistory',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['consignment', 'orderid'],
            description: 'ใช้ "consignment" เสมอถ้าเลขขึ้นต้นด้วย CPTH, CKTH หรือดูเป็น tracking number — ใช้ "orderid" เมื่อเป็น UUID หรือตัวเลขที่ไม่มี prefix'
          },
          values: {
            type: 'string',
            description: 'เลข consignment หรือ order ID คั่นด้วย comma ไม่มีช่องว่าง เช่น "CPTH001,CPTH002,CPTH003"'
          }
        },
        required: ['type', 'values']
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'check_order_confirm',
      description: 'เช็ค CLS log ว่า customer ยืนยันสินค้าแล้วหรือยัง — ต้องส่ง internalOrderId เช่น "26LOTUS-MR525503041" ห้ามส่ง CPTH หรือ UUID orderId',
      parameters: {
        type: 'object',
        properties: {
          orderId: { type: 'string', description: 'internalOrderId จาก get_order_detail result เช่น "26LOTUS-MR525503041" — ไม่ใช่ CPTH ไม่ใช่ UUID' }
        },
        required: ['orderId']
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'get_riders',
      description: 'ดึงรายชื่อ riders ที่ online และสถานะคิว — ใช้ตอบ "queue ตอนนี้มีใครบ้าง", "คนนี้อยู่ในคิวไหม", "rider พร้อมรับงานกี่คน"',
      parameters: {
        type: 'object',
        properties: {
          storeCode: { type: 'string', description: 'รหัสสาขา' }
        },
        required: ['storeCode']
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'get_live_riders',
      description: 'ดึงตำแหน่งและสถานะ riders แบบ real-time — ใช้ตอบ "ตอนนี้ใครออนไลน์บ้าง", "rider คนนี้อยู่ที่ไหน", "ใครกำลัง deliver"',
      parameters: {
        type: 'object',
        properties: {
          storeCode: { type: 'string', description: 'รหัสสาขา' }
        },
        required: ['storeCode']
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'get_rider_performance',
      description: 'ดึงสถิติการทำงานของ rider — ใช้ตอบ "คนนี้วันนี้ทำงานกี่งาน", "accept rate ของใคร drop", "ใครส่งสำเร็จมากสุด"',
      parameters: {
        type: 'object',
        properties: {
          storeCode: { type: 'string', description: 'รหัสสาขา' },
          from: { type: 'string', description: 'วันเริ่มต้น ISO format' },
          to:   { type: 'string', description: 'วันสิ้นสุด ISO format' }
        },
        required: ['storeCode']
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'get_rider_breaks',
      description: 'ดึงประวัติการพักของ rider — ใช้ตอบ "คนนี้พักไปกี่ครั้ง", "พักนานแค่ไหน"',
      parameters: {
        type: 'object',
        properties: {
          userId:   { type: 'string', description: 'MongoDB ObjectId ของ rider' },
          from:     { type: 'string', description: 'วันเริ่มต้น ISO format' },
          to:       { type: 'string', description: 'วันสิ้นสุด ISO format (optional)' }
        },
        required: ['userId', 'from']
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'get_job_diagnostics',
      description: 'วิเคราะห์ว่า job assign ไม่ได้เพราะอะไร ดู log การ assign — ใช้ตอบ "ทำไม job นี้ assign ไม่ได้", "วิเคราะห์ job นี้ให้หน่อย"',
      parameters: {
        type: 'object',
        properties: {
          jobId: { type: 'string', description: 'Job ID' },
          hours: { type: 'number', description: 'ดู log ย้อนหลังกี่ชั่วโมง (default 24)' }
        },
        required: ['jobId']
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'get_rider_jobs',
      description: 'ดึงรายการ jobs ทั้งหมดที่ rider คนนี้รับไป — ใช้เมื่อต้องการรู้ว่า rider รับ job อะไรบ้าง jobId เลขอะไร มี orderIds อะไร เวลาไหน',
      parameters: {
        type: 'object',
        properties: {
          riderName: { type: 'string', description: 'ชื่อ rider (บางส่วนก็ได้ จะ fuzzy match)' },
          riderId:   { type: 'string', description: 'riderId ถ้ารู้แล้ว จะเร็วกว่า' },
          storeCode: { type: 'string', description: 'รหัสสาขา' },
          from:      { type: 'string', description: 'วันเริ่มต้น ISO format' },
          to:        { type: 'string', description: 'วันสิ้นสุด ISO format' }
        },
        required: ['storeCode']
      }
    }
  },

  {
    type: 'function',
    function: {
      name: 'search_rider_by_name',
      description: 'ค้นหา rider จากชื่อแบบ fuzzy (สะกดผิดนิดหน่อยก็ได้) — ใช้ตอนที่ไม่รู้ userId หรือชื่อเต็ม แล้วต้องการ suggest ชื่อที่ใกล้เคียง',
      parameters: {
        type: 'object',
        properties: {
          name:      { type: 'string', description: 'ชื่อที่ต้องการค้นหา (บางส่วนก็ได้)' },
          storeCode: { type: 'string', description: 'รหัสสาขาเพื่อจำกัดผลลัพธ์' }
        },
        required: ['name', 'storeCode']
      }
    }
  }
];
