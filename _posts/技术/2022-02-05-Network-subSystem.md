---
layout: post
title: Network I/O 初探
categories: [基础]
description: some word here
keywords: IO, Java, 磁盘, 文件系统


---

## 一、概览

![](https://i.stack.imgur.com/kiP8n.png)

## 二、Linux Network subsystem：Packet Receiving Process

![image:net](https://myaut.github.io/dtrace-stap-book/images/net.png)

![4: Linux NAPI RX scheme](https://www.researchgate.net/profile/Victor-Moreno-15/publication/279541668/figure/fig7/AS:669497044246544@1536631942904/Linux-NAPI-RX-scheme.png)

### Ring buffer

**Ring Buffer** 位于 NIC 和 IP 层之间（准确的说位于 NIC driver 中），是一个典型的 FIFO 环形队列。Ring Buffer 没有包含数据本身，而是包含了指向 `sk_buff`（socket kernel buffers）的描述符

> Network input-output can require transferring huge amounts of data, so it may be ineffective to explicitly send write commands for each packet. Instead of handling each packet individually, NIC and its driver maintain shared *ring buffer* where driver puts data while card uses *DMA* (direct memory access) mechanisms to read data and send it over network. Ring buffers are defined by two pointers: *head* and *tail*:

![image:ringbuf](https://myaut.github.io/dtrace-stap-book/images/ringbuf.png)

### Ring Buffer & sk_buffer

![image:linux/net](https://myaut.github.io/dtrace-stap-book/images/linux/net.png)

```text
net.ipv4.tcp_rmem = 4096    87380   16777216
```

## 三、NIC & Device Driver Processing

![enter image description here](https://i.stack.imgur.com/ptPxv.png)

![图片来自参考1，对 raise softirq 的函数名做了修改，改为了 napi_schedule](https://ylgrgyq.github.io/2017/07/23/linux-receive-packet-1/ring-buffer.png)

## 四、数据包接收过程

### 网卡→内存

```ruby
                    +-----+
                   |     |                            Memroy
+--------+   1     |     |  2  DMA     +--------+--------+--------+--------+
| Packet |-------->| NIC |------------>| Packet | Packet | Packet | ...... |
+--------+         |     |             +--------+--------+--------+--------+
                   |     |<--------+
                   +-----+         |
                      |            +---------------+
                      |                            |
                    3 | Raise IRQ                  | Disable IRQ
                      |                          5 |
                      |                            |
                      ↓                            |
                   +-----+                   +------------+
                   |     |  Run IRQ handler  |            |
                   | CPU |------------------>| NIC Driver |
                   |     |       4           |            |
                   +-----+                   +------------+
                                                   |
                                                6  | Raise soft IRQ
                                                   |
                                                   ↓
```

> **1：** 数据包从外面的网络进入物理网卡。如果目的地址不是该网卡，且该网卡没有开启混杂模式，该包会被网卡丢弃。
> 
> **2：** 网卡将数据包通过[DMA](https://link.segmentfault.com/?enc=QhyI%2FtG8dGg1LbmLlnpzuA%3D%3D.wXRjOjd3thJLeWC9gzDoXmVQhVSxEWMsWdzKuL74IzFGzsVHsQ2zKFbyecJ25C3iOkOam2GPPavLVor48Q%2FYnw%3D%3D)的方式写入到指定的内存地址，该地址由网卡驱动分配并初始化。注： 老的网卡可能不支持DMA，不过新的网卡一般都支持。
> 
> **3：** 网卡通过硬件中断（IRQ）通知CPU，告诉它有数据来了
> 
> **4：** CPU根据中断表，调用已经注册的中断函数，这个中断函数会调到驱动程序（NIC Driver）中相应的函数
> 
> **5：** 驱动先禁用网卡的中断，表示驱动程序已经知道内存中有数据了，告诉网卡下次再收到数据包直接写内存就可以了，不要再通知CPU了，这样可以提高效率，避免CPU不停的被中断。
> 
> **6：** 启动软中断。这步结束后，硬件中断处理函数就结束返回了。由于硬中断处理程序执行的过程中不能被中断，所以如果它执行时间过长，会导致CPU没法响应其它硬件的中断，于是内核引入软中断，这样可以将硬中断处理函数中耗时的部分移到软中断处理函数里面来慢慢处理。

### 内核中的网络模块

```ruby
                                                     +-----+
                                             17      |     |
                                        +----------->| NIC |
                                        |            |     |
                                        |Enable IRQ  +-----+
                                        |
                                        |
                                  +------------+                                      Memroy
                                  |            |        Read           +--------+--------+--------+--------+
                 +--------------->| NIC Driver |<--------------------- | Packet | Packet | Packet | ...... |
                 |                |            |          9            +--------+--------+--------+--------+
                 |                +------------+
                 |                      |    |        skb
            Poll | 8      Raise softIRQ | 6  +-----------------+
                 |                      |             10       |
                 |                      ↓                      ↓
         +---------------+  Call  +-----------+        +------------------+        +--------------------+  12  +---------------------+
         | net_rx_action |<-------| ksoftirqd |        | napi_gro_receive |------->| enqueue_to_backlog |----->| CPU input_pkt_queue |
         +---------------+   7    +-----------+        +------------------+   11   +--------------------+      +---------------------+
                                                               |                                                      | 13
                                                            14 |        + - - - - - - - - - - - - - - - - - - - - - - +
                                                               ↓        ↓
                                                    +--------------------------+    15      +------------------------+
                                                    | __netif_receive_skb_core |----------->| packet taps(AF_PACKET) |
                                                    +--------------------------+            +------------------------+
                                                               |
                                                               | 16
                                                               ↓
                                                      +-----------------+
                                                      | protocol layers |
                                                      +-----------------+
```

- **1：** 数据包从外面的网络进入物理网卡。如果目的地址不是该网卡，且该网卡没有开启混杂模式，该包会被网卡丢弃。
- **2：** 网卡将数据包通过[DMA](https://link.segmentfault.com/?enc=QhyI%2FtG8dGg1LbmLlnpzuA%3D%3D.wXRjOjd3thJLeWC9gzDoXmVQhVSxEWMsWdzKuL74IzFGzsVHsQ2zKFbyecJ25C3iOkOam2GPPavLVor48Q%2FYnw%3D%3D)的方式写入到指定的内存地址，该地址由网卡驱动分配并初始化。注： 老的网卡可能不支持DMA，不过新的网卡一般都支持。
- **3：** 网卡通过硬件中断（IRQ）通知CPU，告诉它有数据来了
- **4：** CPU根据中断表，调用已经注册的中断函数，这个中断函数会调到驱动程序（NIC Driver）中相应的函数
- **5：** 驱动先禁用网卡的中断，表示驱动程序已经知道内存中有数据了，告诉网卡下次再收到数据包直接写内存就可以了，不要再通知CPU了，这样可以提高效率，避免CPU不停的被中断。
- **6：** 启动软中断。这步结束后，硬件中断处理函数就结束返回了。由于硬中断处理程序执行的过程中不能被中断，所以如果它执行时间过长，会导致CPU没法响应其它硬件的中断，于是内核引入软中断，这样可以将硬中断处理函数中耗时的部分移到软中断处理函数里面来慢慢处理。

### 内核的网络模块

软中断会触发内核网络模块中的软中断处理函数，后续流程如下

                                                     +-----+
                                             17      | |
                                        +----------->| NIC |
                                        | | |
                                        |Enable IRQ  +-----+ |
                                        | +------------+                                      Memroy | | Read           +--------+--------+--------+--------+
                 +--------------->| NIC Driver |<--------------------- | Packet | Packet | Packet | ...... |
                 | | | 9            +--------+--------+--------+--------+ | +------------+ | | | skb
            Poll | 8      Raise softIRQ | 6  +-----------------+ | | 10 |
                 | ↓                      ↓
         +---------------+  Call  +-----------+        +------------------+        +--------------------+  12  +---------------------+ | net_rx_action |<-------| ksoftirqd | | napi_gro_receive |------->| enqueue_to_backlog |----->| CPU input_pkt_queue |
         +---------------+   7    +-----------+        +------------------+   11   +--------------------+      +---------------------+
                                                               | | 13
                                                            14 | + - - - - - - - - - - - - - - - - - - - - - - +
                                                               ↓        ↓
                                                    +--------------------------+    15      +------------------------+ | __netif_receive_skb_core |----------->| packet taps(AF_PACKET) |
                                                    +--------------------------+            +------------------------+
                                                               | | 16
                                                               ↓
                                                      +-----------------+ | protocol layers |
                                                      +-----------------+

> **7：** 内核中的ksoftirqd进程专门负责软中断的处理，当它收到软中断后，就会调用相应软中断所对应的处理函数，对于上面第6步中是网卡驱动模块抛出的软中断，ksoftirqd会调用网络模块的net_rx_action函数
> 
> **8：** net_rx_action调用网卡驱动里的poll函数来一个一个的处理数据包
> 
> **9：** 在pool函数中，驱动会一个接一个的读取网卡写到内存中的数据包，内存中数据包的格式只有驱动知道
> 
> **10：** 驱动程序将内存中的数据包转换成内核网络模块能识别的skb格式，然后调用napi_gro_receive函数
> 
> **11：** napi_gro_receive会处理[GRO](https://link.segmentfault.com/?enc=0BMPTeLSJVSdUPDk0VKANA%3D%3D.GLWVgnwM7nhKk9YFzbgZg7%2F%2BZygW2T%2Br6Daj7Vdia9R5lEwnZDq4qRXyOykqeNFB)相关的内容，也就是将可以合并的数据包进行合并，这样就只需要调用一次协议栈。然后判断是否开启了[RPS](https://link.segmentfault.com/?enc=N2IQEEClP7fHPtytgJpUzg%3D%3D.yJ4gIOTr9qBLB97oyBbB7YDzDtq8Q4YoC73FJmzJjjuVDfObZQuOSQWxo3NtALukj8HugsGPCoMlcOxOB7IejOjNXJduLUYdZUNFK5FPIoQiV9y%2B0o9KZNut1eIoIFp3)，如果开启了，将会调用enqueue_to_backlog
> 
> **12：** 在enqueue_to_backlog函数中，会将数据包放入CPU的softnet_data结构体的input_pkt_queue中，然后返回，如果input_pkt_queue满了的话，该数据包将会被丢弃，queue的大小可以通过net.core.netdev_max_backlog来配置
> 
> **13：** CPU会接着在自己的软中断上下文中处理自己input_pkt_queue里的网络数据（调用__netif_receive_skb_core）
> 
> **14：** 如果没开启[RPS](https://link.segmentfault.com/?enc=wvJ4e3u9YoQSACxTL8WNOg%3D%3D.YQHL%2FcinyDaNPhsFkn03QpuEg5lslVGESjXvtGh0I31FghKKCKO3bGNWV%2FJ6nNjukom4YkGzzndpOJz3ywv4O%2FvTf0Sw8QYeqp0IKPeoZ3N4%2B7S%2FpdPCku3sLKVkZtba)，napi_gro_receive会直接调用__netif_receive_skb_core
> 
> **15：** 看是不是有AF_PACKET类型的socket（也就是我们常说的原始套接字），如果有的话，拷贝一份数据给它。tcpdump抓包就是抓的这里的包。
> 
> **16：** 调用协议栈相应的函数，将数据包交给协议栈处理。
> 
> **17：** 待内存中的所有数据包被处理完成后（即poll函数执行完成），启用网卡的硬中断，这样下次网卡再收到数据的时候就会通知CPU

### 协议栈

```ruby
          |
          |
          ↓         promiscuous mode &&
      +--------+    PACKET_OTHERHOST (set by driver)   +-----------------+
      | ip_rcv |-------------------------------------->| drop this packet|
      +--------+                                       +-----------------+
          |
          |
          ↓
+---------------------+
| NF_INET_PRE_ROUTING |
+---------------------+
          |
          |
          ↓
      +---------+
      |         | enabled ip forword  +------------+        +----------------+
      | routing |-------------------->| ip_forward |------->| NF_INET_FORWARD |
      |         |                     +------------+        +----------------+
      +---------+                                                   |
          |                                                         |
          | destination IP is local                                 ↓
          ↓                                                 +---------------+
 +------------------+                                       | dst_output_sk |
 | ip_local_deliver |                                       +---------------+
 +------------------+
          |
          |
          ↓
 +------------------+
 | NF_INET_LOCAL_IN |
 +------------------+
          |
          |
          ↓
    +-----------+
    | UDP layer |
    +-----------+
```

> - **ip_rcv：** ip_rcv函数是IP模块的入口函数，在该函数里面，第一件事就是将垃圾数据包（目的mac地址不是当前网卡，但由于网卡设置了混杂模式而被接收进来）直接丢掉，然后调用注册在NF_INET_PRE_ROUTING上的函数
> - **NF_INET_PRE_ROUTING：** netfilter放在协议栈中的钩子，可以通过iptables来注入一些数据包处理函数，用来修改或者丢弃数据包，如果数据包没被丢弃，将继续往下走
> - **routing：** 进行路由，如果是目的IP不是本地IP，且没有开启ip forward功能，那么数据包将被丢弃，如果开启了ip forward功能，那将进入ip_forward函数
> - **ip_forward：** ip_forward会先调用netfilter注册的NF_INET_FORWARD相关函数，如果数据包没有被丢弃，那么将继续往后调用dst_output_sk函数
> - **dst_output_sk：** 该函数会调用IP层的相应函数将该数据包发送出去，同下一篇要介绍的数据包发送流程的后半部分一样。
> - **ip_local_deliver**：如果上面**routing**的时候发现目的IP是本地IP，那么将会调用该函数，在该函数中，会先调用NF_INET_LOCAL_IN相关的钩子程序，如果通过，数据包将会向下发送到UDP层

## 五、I/O模型

### 阻塞式I/O

![](https://pdai.tech/_images/pics/1492928416812_4.png)

### 非阻塞式I/O

![](https://pdai.tech/_images/pics/1492929000361_5.png)

### I/O多路复用

![](https://pdai.tech/_images/pics/1492929444818_6.png)

#### 多路复用I/O实现

- select
  
  - select的timeout是1ns，poll和epoll的timeout是1ms，select适用于实时性更高的场景，例如核反应堆
  
  - select可移植性好

- poll

- epoll

- kqueue

### 信号量驱动

![](https://pdai.tech/_images/pics/1492929553651_7.png)

### 异步I/O

![](https://pdai.tech/_images/pics/1492930243286_8.png)

### 五大I/O模型比较

![](https://pdai.tech/_images/pics/1492928105791_3.png)

## 六、Reactor pattern

> **Reactor模式的底层往往使用select/poll/epoll等I/O复用方式来实现；Proactor模式的底层使用异步I/O（如Windows中的完成端口或UNIX中aio_*()系列函数）来实现。**

### 传统IO模型

per thead per connection

![](https://pdai.tech/_images/io/java-io-reactor-1.png)

### Reactor事件驱动模型

![](https://pdai.tech/_images/io/java-io-reactor-2.png)

### Reactor模型：业务&IO分离

![](https://pdai.tech/_images/io/java-io-reactor-3.png)

### Reactor模型：mainReactor&subReactor

![](https://pdai.tech/_images/io/java-io-reactor-4.png)

## 七、网络链路调优

1. **网卡Ring Buffer**：根据不同的网卡类型，把Ring Buffer设置成最大值；

2. **网卡软中断**：手工绑定中断到多核CPU，避免CPU0的性能瓶颈，提升整体性能；

3. **网卡缓冲区到TCP/IP栈之间**：适当增加net.core.netdev_max_backlog的值，提升Input Packet Queue;

4. **半连接队列**：开启net.ipv4.tcp_syncookies，防范少量的tcp syn攻击

5. **完整连接队列**：通过net.core.somaxconn,调大一些队列长度,给应用程序以更多处理时间

6. **Socket Recv Buffer**：开启net.ipv4.tcp_moderate_rcvbuf=1,自动调节机制生效，并且把net.ipv4.tcp_rmem/net.core.rmem_max中默认值和最大值调大

## 参考文档

https://i.stack.imgur.com/DN7Vg.png

https://pdai.tech/md/java/io/java-io-nio-select-epoll.html

https://indico.cern.ch/event/408139/contributions/979737/attachments/815628/1117588/CHEP06.pdf

https://myaut.github.io/dtrace-stap-book/kernel/net.html

[linux - What is the relationship of DMA ring buffer and TX/RX ring for a network card? - Stack Overflow](https://stackoverflow.com/questions/47450231/what-is-the-relationship-of-dma-ring-buffer-and-tx-rx-ring-for-a-network-card)
